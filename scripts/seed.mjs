#!/usr/bin/env node
// Deterministic, idempotent seed for the meal-planner D1 database.
//
//   node scripts/seed.mjs            # local D1
//   node scripts/seed.mjs --remote   # remote D1
//
// Recipes are imported from data/recipes.seed.json (the single source of truth)
// and upserted by slug, so re-running never duplicates rows. The 30-day meal
// plan is then rebuilt from the recipes that actually exist in the DB, so every
// meal_plan_entry is guaranteed to reference an existing recipe.

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const isRemote = process.argv.includes('--remote')
const flag = isRemote ? '--remote' : '--local'
const DB = 'meal-planner-db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const seedPath = join(__dirname, '..', 'data', 'recipes.seed.json')

function q(s) {
  return String(s ?? '').replace(/'/g, "''")
}

// --- Load & validate the recipe seed --------------------------------------

const raw = JSON.parse(readFileSync(seedPath, 'utf8'))
if (!Array.isArray(raw) || raw.length === 0) {
  throw new Error(`Expected a non-empty array in ${seedPath}`)
}

const seenSlugs = new Set()
const recipes = raw.map((r, i) => {
  const slug = String(r.slug || '').trim()
  if (!slug) throw new Error(`Recipe #${i} (${r.title}) has no slug`)
  if (seenSlugs.has(slug)) throw new Error(`Duplicate slug: ${slug}`)
  seenSlugs.add(slug)

  const macros = r.macros ? { ...r.macros } : null
  // Preserve an explicitly stated protein figure if the source provided one.
  if (macros && r.known_protein_g != null) macros.protein_g = r.known_protein_g

  return {
    slug,
    title: String(r.title),
    category: String(r.category),
    servings: Number(r.servings) || 1,
    prep_minutes: r.prep_minutes == null ? null : Number(r.prep_minutes),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    is_seafood: r.is_seafood ? 1 : 0,
    macros,
    macros_confidence: r.macros_confidence ?? null,
    macros_assumptions: r.macros_assumptions ?? null,
  }
})

console.log(`Loaded ${recipes.length} recipes from ${seedPath}`)

// --- Helper to run a SQL file against D1 ----------------------------------

function runSqlFile(sql, label) {
  const tmp = join(__dirname, `.seed-${label}.sql`)
  writeFileSync(tmp, sql)
  try {
    execSync(`npx wrangler d1 execute ${DB} ${flag} --file "${tmp}"`, { stdio: 'inherit' })
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
}

// Run a SELECT and return the rows (parsed from wrangler --json output).
function query(command) {
  const out = execSync(
    `npx wrangler d1 execute ${DB} ${flag} --json --command "${command.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' }
  )
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  const json = JSON.parse(out.slice(start, end + 1))
  return json[0]?.results ?? []
}

// --- Step 1: rebuild recipes (upsert by slug, prune stale) ----------------

const slugList = recipes.map(r => `'${q(r.slug)}'`).join(', ')

let sql = ''
sql += 'DELETE FROM meal_plan_entries;\n'
sql += `DELETE FROM recipes WHERE slug NOT IN (${slugList});\n\n`

for (const r of recipes) {
  const macrosSql = r.macros ? `'${q(JSON.stringify(r.macros))}'` : 'NULL'
  const confSql = r.macros_confidence ? `'${q(r.macros_confidence)}'` : 'NULL'
  const assumpSql = r.macros_assumptions ? `'${q(r.macros_assumptions)}'` : 'NULL'
  sql +=
    `INSERT INTO recipes (title, slug, category, servings, prep_minutes, ingredients, steps, tags, is_seafood, source, macros, macros_confidence, macros_assumptions) VALUES (` +
    `'${q(r.title)}', '${q(r.slug)}', '${q(r.category)}', ${r.servings}, ${r.prep_minutes ?? 'NULL'}, ` +
    `'${q(JSON.stringify(r.ingredients))}', '${q(JSON.stringify(r.steps))}', '${q(JSON.stringify(r.tags))}', ${r.is_seafood}, 'seed', ` +
    `${macrosSql}, ${confSql}, ${assumpSql}) ` +
    `ON CONFLICT(slug) DO UPDATE SET ` +
    `title=excluded.title, category=excluded.category, servings=excluded.servings, prep_minutes=excluded.prep_minutes, ` +
    `ingredients=excluded.ingredients, steps=excluded.steps, tags=excluded.tags, is_seafood=excluded.is_seafood, source=excluded.source, ` +
    // Only fill macros that are currently null — never clobber a value that was
    // estimated or hand-edited after seeding.
    `macros=COALESCE(recipes.macros, excluded.macros), ` +
    `macros_confidence=COALESCE(recipes.macros_confidence, excluded.macros_confidence), ` +
    `macros_assumptions=COALESCE(recipes.macros_assumptions, excluded.macros_assumptions), ` +
    `updated_at=(unixepoch());\n`
}

// Default settings (daily targets, timezone, etc.)
const appSettings = JSON.stringify({
  kcal_target: 2300,
  protein_g_target: 150,
  carbs_g_target: 250,
  fat_g_target: 80,
  water_glasses_target: 8,
  timezone: 'Europe/Warsaw',
  seafood_enabled: true,
  theme: 'auto',
})
sql += `\nINSERT INTO settings (key, value) VALUES ('app', '${q(appSettings)}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;\n`

runSqlFile(sql, 'recipes')

// --- Step 2: read back real recipe ids, grouped by category ---------------

const rows = query('SELECT id, slug, category, macros FROM recipes')
const inCat = (...cats) => rows.filter(r => cats.includes(r.category))
const nonEmpty = (p) => (p.length ? p : rows)
const slugToId = new Map(rows.map(r => [r.slug, r.id]))
const kcalOf = new Map(rows.map(r => {
  let k = 0
  try { k = JSON.parse(r.macros || '{}').kcal || 0 } catch {}
  return [r.id, k]
}))

// Fixed daily protein boosters — always added to every day of the plan
// (skyr + a scoop of protein powder) so the plan reliably approaches the
// ~150 g protein target, per the source diet's "do 150 g" guidance.
const EXTRA_SLUGS = ['skyr-men-protein', 'porcja-bialka-proteinowego']
const dailyExtras = EXTRA_SLUGS.map(s => slugToId.get(s)).filter(Boolean)

// Calorie top-up boosters so every day reaches the target band (min 2000,
// aim ~2300 kcal). Varied protein/dairy snacks.
const BOOSTER_SLUGS = ['p4-koktajl-proteinowy', 'p1-batony-bialkowe-orzechowe', 'twarog-owoce-granola', 'p2-skyr-z-orzechami', 'owsianka-z-bananem']
const boosterPool = BOOSTER_SLUGS
  .map(s => ({ id: slugToId.get(s), kcal: kcalOf.get(slugToId.get(s)) || 0 }))
  .filter(b => b.id)
const KCAL_MIN = 2000
const KCAL_AIM = 2300

const breakfastPool = nonEmpty(inCat('breakfast'))
const snackPool = nonEmpty(inCat('snack').filter(r => !EXTRA_SLUGS.includes(r.slug)))
const lunchPool = nonEmpty(inCat('main'))
const dinnerPool = nonEmpty(inCat('main', 'classic'))

// --- Step 3: build the 30-day plan — every batch dish spans 2 days ---------
//
// 30 days split into 15 two-day blocks. Lunch and dinner are batch-cooked once
// per block ("gotuj na 2 dni"): day 1 of the block is the cook day
// (is_leftover=0) and day 2 eats the leftovers (is_leftover=1). Breakfasts and
// snacks rotate daily. Seafood dishes appear naturally in the dinner rotation.

function getDay(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset - 14) // anchor: day 1 is 14 days ago
  return d.toISOString().slice(0, 10)
}

const DAYS = 30
const BLOCK_DAYS = 2 // cook once, eat for 2 days
const dinnerOffset = Math.floor(dinnerPool.length / 2) // keep dinners distinct from lunches

const entries = []
for (let day = 0; day < DAYS; day++) {
  const date = getDay(day)
  const block = Math.floor(day / BLOCK_DAYS)
  const isLeftover = day % BLOCK_DAYS === 0 ? 0 : 1

  const lunch = lunchPool[block % lunchPool.length]
  const dinner = dinnerPool[(block + dinnerOffset) % dinnerPool.length]

  const dayEntries = []
  let dayKcal = 0
  const add = (meal_type, id, batch_group = null, lo = 0) => {
    dayEntries.push({ date, meal_type, recipe_id: id, servings: 1, batch_group, is_leftover: lo })
    dayKcal += kcalOf.get(id) || 0
  }

  add('breakfast', breakfastPool[day % breakfastPool.length].id)
  add('lunch', lunch.id, `obiad-${block}`, isLeftover)
  add('dinner', dinner.id, `kolacja-${block}`, isLeftover)
  add('snack', snackPool[day % snackPool.length].id)
  for (const id of dailyExtras) add('snack', id) // skyr + protein shake

  // Calorie floor: top up with boosters until the day reaches the target band
  // (never below 2000 kcal, aiming ~2300). Stop once >= aim, or once >= min and
  // the next booster would overshoot the upper bound.
  for (let guard = 0; guard < 12 && boosterPool.length && dayKcal < KCAL_AIM; guard++) {
    const b = boosterPool[(day + guard) % boosterPool.length]
    if (dayKcal >= KCAL_MIN && dayKcal + b.kcal > 2500) break
    add('snack', b.id)
  }

  entries.push(...dayEntries)
}

let planSql = ''
for (const e of entries) {
  const bg = e.batch_group ? `'${q(e.batch_group)}'` : 'NULL'
  planSql +=
    `INSERT INTO meal_plan_entries (date, meal_type, recipe_id, servings, batch_group, is_leftover, status) VALUES (` +
    `'${e.date}', '${e.meal_type}', ${e.recipe_id}, ${e.servings}, ${bg}, ${e.is_leftover}, 'planned');\n`
}
runSqlFile(planSql, 'plan')

// --- Step 4: verify -------------------------------------------------------

const catCounts = query("SELECT category, COUNT(*) AS n FROM recipes GROUP BY category ORDER BY category")
const [{ n: recipeTotal }] = query('SELECT COUNT(*) AS n FROM recipes')
const [{ n: planTotal }] = query('SELECT COUNT(*) AS n FROM meal_plan_entries')
const [{ n: orphans }] = query(
  'SELECT COUNT(*) AS n FROM meal_plan_entries e LEFT JOIN recipes r ON e.recipe_id = r.id WHERE e.recipe_id IS NOT NULL AND r.id IS NULL'
)

// Every batch group should span exactly BLOCK_DAYS days.
const [{ n: badBatches }] = query(
  `SELECT COUNT(*) AS n FROM (SELECT batch_group FROM meal_plan_entries WHERE batch_group IS NOT NULL GROUP BY batch_group HAVING COUNT(*) <> ${BLOCK_DAYS})`
)

// Daily planned kcal must never fall below the minimum.
const [{ minK, maxK }] = query(
  "SELECT MIN(dk) AS minK, MAX(dk) AS maxK FROM (SELECT e.date, SUM(COALESCE(json_extract(r.macros,'$.kcal'),0)) AS dk FROM meal_plan_entries e JOIN recipes r ON e.recipe_id = r.id GROUP BY e.date)"
)

console.log('\n─── Seed verification ───')
console.log(`Recipes total: ${recipeTotal}`)
for (const c of catCounts) console.log(`  ${c.category}: ${c.n}`)
console.log(`Meal plan entries: ${planTotal}`)
console.log(`Orphan plan entries (should be 0): ${orphans}`)
console.log(`Batch groups not spanning ${BLOCK_DAYS} days (should be 0): ${badBatches}`)
console.log(`Daily kcal range: ${Math.round(minK)}–${Math.round(maxK)} (min must be ≥ ${KCAL_MIN})`)
if (Number(minK) < KCAL_MIN) {
  console.error(`❌ Some day is below ${KCAL_MIN} kcal (min ${Math.round(minK)}).`)
  process.exit(1)
}
if (Number(orphans) !== 0) {
  console.error('❌ Orphan meal_plan_entries detected — plan not fully reconciled.')
  process.exit(1)
}
if (Number(badBatches) !== 0) {
  console.error(`❌ Some batch groups do not span ${BLOCK_DAYS} days.`)
  process.exit(1)
}
console.log('✅ Seed complete — every planned meal links to an existing recipe.')
