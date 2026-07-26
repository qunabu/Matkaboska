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

// --- Step 2: read back real recipe ids, keyed by slug ---------------------

const rows = query('SELECT id, slug FROM recipes')
const slugToId = new Map(rows.map(r => [r.slug, r.id]))

// --- Step 3: rebuild the real 30-day plan (dieta-30-dni.md, blocks 1–10) ---
//
// Reproduces the source plan faithfully (pesco-vegetarian: no meat, but fish &
// shrimp kept). Batch dishes (🍲 "gotuj na N dni") share a batch_group; the
// cook day has is_leftover=false, the follow-up days true. Seafood dinners fall
// on source days 8 & 25 (krewetki 🦐) and 11 & 27 (łosoś 🐟).

// day = { b: breakfast slug, l: [lunch slug, batchGroup|null, cook bool],
//         d: [dinner slug, batchGroup|null, cook bool], s: snack slug }
const B = (slug) => slug
const PLAN = [
  // Blok 1 (1–3): boloński (obiad, 3 dni) + tofu (kolacja, 3 dni)
  { b: 's1-owsianka-proteinowa',                l: ['makaron-z-bolonskim-z-soczewicy', 'l-bolonski-1', true],  d: ['tofu-zmieniajace-zycie', 'd-tofu-1', true],  s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's2-jajecznica-z-tostem',                l: ['makaron-z-bolonskim-z-soczewicy', 'l-bolonski-1', false], d: ['tofu-zmieniajace-zycie', 'd-tofu-1', false], s: 'p2-skyr-z-orzechami' },
  { b: 's3-nalesniki-proteinowe-z-twarogiem',   l: ['makaron-z-bolonskim-z-soczewicy', 'l-bolonski-1', false], d: ['tofu-zmieniajace-zycie', 'd-tofu-1', false], s: 'p1-batony-bialkowe-orzechowe' },
  // Blok 2 (4–6): curry (obiad, 3 dni); kolacje świeże
  { b: 's4-jogurt-proteinowy-z-orzechami',      l: ['curry-warzywne-z-ciecierzyca', 'l-curry-1', true],  d: ['szakszuka-z-ciecierzyca', null, false], s: 'p3-hummus-z-warzywami' },
  { b: 's1-owsianka-proteinowa',                l: ['curry-warzywne-z-ciecierzyca', 'l-curry-1', false], d: ['hiszpanska-tortilla', null, false],     s: 'p4-koktajl-proteinowy' },
  { b: 's5-placki-z-cukinii',                   l: ['curry-warzywne-z-ciecierzyca', 'l-curry-1', false], d: ['szakszuka-z-ciecierzyca', null, false], s: 'p2-skyr-z-orzechami' },
  // Blok 3 (7–9): moussaka (obiad, 3 dni)
  { b: 's2-jajecznica-z-tostem',                l: ['vege-moussaka', 'l-moussaka-1', true],  d: ['risotto-z-groszkiem-i-szpinakiem', null, false], s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's6-omlet-ze-szpinakiem-i-serem',        l: ['vege-moussaka', 'l-moussaka-1', false], d: ['krewetki-smazone-z-warzywami', null, false],      s: 'p4-koktajl-proteinowy' }, // 🦐
  { b: 's3-nalesniki-proteinowe-z-twarogiem',   l: ['vege-moussaka', 'l-moussaka-1', false], d: ['risotto-z-groszkiem-i-szpinakiem', null, false], s: 'p2-skyr-z-orzechami' },
  // Blok 4 (10–12): dhal+aloo gobi (obiad, 3 dni) + feta z makaronem (kolacja, 2 dni)
  { b: 's1-owsianka-proteinowa',                l: ['dhal-z-czerwonej-soczewicy', 'l-dhal-1', true],  d: ['pieczona-feta-z-makaronem', 'd-feta-1', true],  s: 'p3-hummus-z-warzywami' },
  { b: 's4-jogurt-proteinowy-z-orzechami',      l: ['dhal-z-czerwonej-soczewicy', 'l-dhal-1', false], d: ['pieczony-losos-z-warzywami', null, false],      s: 'p1-batony-bialkowe-orzechowe' }, // 🐟
  { b: 's2-jajecznica-z-tostem',                l: ['dhal-z-czerwonej-soczewicy', 'l-dhal-1', false], d: ['pieczona-feta-z-makaronem', 'd-feta-1', false], s: 'p2-skyr-z-orzechami' },
  // Blok 5 (13–15): miska ciecierzyca (obiad, 3 dni) + kasza z tofu (kolacja, 3 dni)
  { b: 's5-placki-z-cukinii',                   l: ['miska-z-ciecierzyca-tabbouleh-hummus', 'l-miska-1', true],  d: ['kasza-z-tofu-stir-fry', 'd-kasza-1', true],  s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's1-owsianka-proteinowa',                l: ['miska-z-ciecierzyca-tabbouleh-hummus', 'l-miska-1', false], d: ['kasza-z-tofu-stir-fry', 'd-kasza-1', false], s: 'p4-koktajl-proteinowy' },
  { b: 's3-nalesniki-proteinowe-z-twarogiem',   l: ['miska-z-ciecierzyca-tabbouleh-hummus', 'l-miska-1', false], d: ['kasza-z-tofu-stir-fry', 'd-kasza-1', false], s: 'p2-skyr-z-orzechami' },
  // Blok 6 (16–18): boloński (obiad, 3 dni)
  { b: 's2-jajecznica-z-tostem',                l: ['makaron-z-bolonskim-z-soczewicy', 'l-bolonski-2', true],  d: ['tofu-zmieniajace-zycie', null, false],  s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's6-omlet-ze-szpinakiem-i-serem',        l: ['makaron-z-bolonskim-z-soczewicy', 'l-bolonski-2', false], d: ['hiszpanska-tortilla', null, false],     s: 'p3-hummus-z-warzywami' },
  { b: 's4-jogurt-proteinowy-z-orzechami',      l: ['makaron-z-bolonskim-z-soczewicy', 'l-bolonski-2', false], d: ['tofu-zmieniajace-zycie', null, false],  s: 'p2-skyr-z-orzechami' },
  // Blok 7 (19–21): curry (obiad, 3 dni)
  { b: 's1-owsianka-proteinowa',                l: ['curry-warzywne-z-ciecierzyca', 'l-curry-2', true],  d: ['szakszuka-z-ciecierzyca', null, false], s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's5-placki-z-cukinii',                   l: ['curry-warzywne-z-ciecierzyca', 'l-curry-2', false], d: ['s5-placki-z-cukinii', null, false],      s: 'p2-skyr-z-orzechami' }, // lekka kolacja: placki
  { b: 's2-jajecznica-z-tostem',                l: ['curry-warzywne-z-ciecierzyca', 'l-curry-2', false], d: ['szakszuka-z-ciecierzyca', null, false], s: 'p4-koktajl-proteinowy' },
  // Blok 8 (22–24): pasta z fasoli (obiad, 3 dni) + kasza z tofu (kolacja, 3 dni)
  { b: 's3-nalesniki-proteinowe-z-twarogiem',   l: ['pasta-z-bialej-fasoli-kalafior-awokado', 'l-pasta-1', true],  d: ['kasza-z-tofu-stir-fry', 'd-kasza-2', true],  s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's1-owsianka-proteinowa',                l: ['pasta-z-bialej-fasoli-kalafior-awokado', 'l-pasta-1', false], d: ['kasza-z-tofu-stir-fry', 'd-kasza-2', false], s: 'p3-hummus-z-warzywami' },
  { b: 's6-omlet-ze-szpinakiem-i-serem',        l: ['pasta-z-bialej-fasoli-kalafior-awokado', 'l-pasta-1', false], d: ['kasza-z-tofu-stir-fry', 'd-kasza-2', false], s: 'p2-skyr-z-orzechami' },
  // Blok 9 (25–27): moussaka (obiad, 3 dni)
  { b: 's2-jajecznica-z-tostem',                l: ['vege-moussaka', 'l-moussaka-2', true],  d: ['krewetki-smazone-z-warzywami', null, false],      s: 'p1-batony-bialkowe-orzechowe' }, // 🦐
  { b: 's4-jogurt-proteinowy-z-orzechami',      l: ['vege-moussaka', 'l-moussaka-2', false], d: ['risotto-z-groszkiem-i-szpinakiem', null, false], s: 'p2-skyr-z-orzechami' },
  { b: 's1-owsianka-proteinowa',                l: ['vege-moussaka', 'l-moussaka-2', false], d: ['pieczony-losos-z-warzywami', null, false],       s: 'p4-koktajl-proteinowy' }, // 🐟
  // Blok 10 (28–30): dhal (obiad, 3 dni)
  { b: 's3-nalesniki-proteinowe-z-twarogiem',   l: ['dhal-z-czerwonej-soczewicy', 'l-dhal-2', true],  d: ['pieczona-feta-z-makaronem', null, false], s: 'p1-batony-bialkowe-orzechowe' },
  { b: 's5-placki-z-cukinii',                   l: ['dhal-z-czerwonej-soczewicy', 'l-dhal-2', false], d: ['hiszpanska-tortilla', null, false],       s: 'p2-skyr-z-orzechami' },
  { b: 's2-jajecznica-z-tostem',                l: ['dhal-z-czerwonej-soczewicy', 'l-dhal-2', false], d: ['tofu-zmieniajace-zycie', null, false],    s: 'p1-batony-bialkowe-orzechowe' },
]

function getDay(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset - 14) // anchor: day 1 is 14 days ago
  return d.toISOString().slice(0, 10)
}

const entries = []
const missingSlugs = new Set()
function addEntry(date, meal_type, slug, batch_group, is_leftover) {
  const id = slugToId.get(slug)
  if (!id) { missingSlugs.add(slug); return }
  entries.push({ date, meal_type, recipe_id: id, servings: 1, batch_group, is_leftover, status: 'planned' })
}

PLAN.forEach((day, i) => {
  const date = getDay(i)
  addEntry(date, 'breakfast', B(day.b), null, 0)
  const [lSlug, lBatch, lCook] = day.l
  addEntry(date, 'lunch', lSlug, lBatch, lCook ? 0 : 1)
  const [dSlug, dBatch, dCook] = day.d
  addEntry(date, 'dinner', dSlug, dBatch, dBatch ? (dCook ? 0 : 1) : 0)
  addEntry(date, 'snack', day.s, null, 0)
})

if (missingSlugs.size) {
  console.error(`❌ Plan references slugs not present in the seed: ${[...missingSlugs].join(', ')}`)
  process.exit(1)
}

let planSql = ''
for (const e of entries) {
  const bg = e.batch_group ? `'${q(e.batch_group)}'` : 'NULL'
  planSql +=
    `INSERT INTO meal_plan_entries (date, meal_type, recipe_id, servings, batch_group, is_leftover, status) VALUES (` +
    `'${e.date}', '${e.meal_type}', ${e.recipe_id}, ${e.servings}, ${bg}, ${e.is_leftover}, '${e.status}');\n`
}
runSqlFile(planSql, 'plan')

// --- Step 4: verify -------------------------------------------------------

const catCounts = query("SELECT category, COUNT(*) AS n FROM recipes GROUP BY category ORDER BY category")
const [{ n: recipeTotal }] = query('SELECT COUNT(*) AS n FROM recipes')
const [{ n: planTotal }] = query('SELECT COUNT(*) AS n FROM meal_plan_entries')
const [{ n: orphans }] = query(
  'SELECT COUNT(*) AS n FROM meal_plan_entries e LEFT JOIN recipes r ON e.recipe_id = r.id WHERE e.recipe_id IS NOT NULL AND r.id IS NULL'
)

console.log('\n─── Seed verification ───')
console.log(`Recipes total: ${recipeTotal}`)
for (const c of catCounts) console.log(`  ${c.category}: ${c.n}`)
console.log(`Meal plan entries: ${planTotal}`)
console.log(`Orphan plan entries (should be 0): ${orphans}`)
if (Number(orphans) !== 0) {
  console.error('❌ Orphan meal_plan_entries detected — plan not fully reconciled.')
  process.exit(1)
}
console.log('✅ Seed complete — every planned meal links to an existing recipe.')
