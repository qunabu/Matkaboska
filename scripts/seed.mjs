#!/usr/bin/env node
// Run: node scripts/seed.mjs [--remote]
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'

const isRemote = process.argv.includes('--remote')
const flag = isRemote ? '--remote' : '--local'

const recipes = [
  {
    id: 1,
    title: 'Owsianka z bananem i orzechami',
    slug: 'owsianka-z-bananem',
    category: 'breakfast',
    servings: 1,
    prep_minutes: 10,
    ingredients: [
      { name: 'Płatki owsiane', amount: '80', unit: 'g' },
      { name: 'Mleko', amount: '200', unit: 'ml' },
      { name: 'Banan', amount: '1', unit: 'szt' },
      { name: 'Orzechy włoskie', amount: '20', unit: 'g' },
      { name: 'Miód', amount: '1', unit: 'łyżka' },
    ],
    steps: [
      'Zagotuj mleko w garnku.',
      'Dodaj płatki owsiane i gotuj 5 minut, mieszając.',
      'Przelej do miski. Pokrój banana i ułóż na wierzchu.',
      'Dodaj orzechy i skrop miodem.',
    ],
    tags: ['śniadanie', 'wegetariańskie', 'szybkie'],
    is_seafood: 0,
    macros: { kcal: 520, protein_g: 15, carbs_g: 82, fat_g: 14 },
    macros_confidence: 'high',
  },
  {
    id: 2,
    title: 'Jajecznica z warzywami',
    slug: 'jajecznica-z-warzywami',
    category: 'breakfast',
    servings: 1,
    prep_minutes: 10,
    ingredients: [
      { name: 'Jajka', amount: '3', unit: 'szt' },
      { name: 'Papryka czerwona', amount: '0.5', unit: 'szt' },
      { name: 'Cebula', amount: '0.5', unit: 'szt' },
      { name: 'Szpinak', amount: '30', unit: 'g' },
      { name: 'Oliwa z oliwek', amount: '1', unit: 'łyżka' },
    ],
    steps: [
      'Pokrój paprykę i cebulę w drobną kostkę.',
      'Podsmaż cebulę na oliwie 2 minuty.',
      'Dodaj paprykę i smaż kolejne 2 minuty.',
      'Dodaj szpinak i podsmażaj chwilę.',
      'Wbij jajka, mieszaj do ścięcia. Dopraw.',
    ],
    tags: ['śniadanie', 'wegetariańskie', 'wysokobiałkowe'],
    is_seafood: 0,
    macros: { kcal: 320, protein_g: 22, carbs_g: 8, fat_g: 22 },
    macros_confidence: 'high',
  },
  {
    id: 3,
    title: 'Smoothie proteinowe z jagodami',
    slug: 'smoothie-proteinowe-jagody',
    category: 'smoothie',
    servings: 1,
    prep_minutes: 5,
    ingredients: [
      { name: 'Jagody mrożone', amount: '150', unit: 'g' },
      { name: 'Jogurt grecki', amount: '150', unit: 'g' },
      { name: 'Odżywka białkowa', amount: '30', unit: 'g' },
      { name: 'Mleko migdałowe', amount: '200', unit: 'ml' },
      { name: 'Nasiona chia', amount: '10', unit: 'g' },
    ],
    steps: [
      'Wrzuć wszystkie składniki do blendera.',
      'Blenduj 30 sekund do gładkości.',
      'Przelej do szklanki i od razu podawaj.',
    ],
    tags: ['smoothie', 'wegetariańskie', 'wysokobiałkowe', 'szybkie'],
    is_seafood: 0,
    macros: { kcal: 380, protein_g: 35, carbs_g: 38, fat_g: 8 },
    macros_confidence: 'high',
  },
  {
    id: 4,
    title: 'Kurczak z ryżem i warzywami',
    slug: 'kurczak-ryz-warzywa',
    category: 'lunch',
    servings: 2,
    prep_minutes: 35,
    ingredients: [
      { name: 'Pierś kurczaka', amount: '400', unit: 'g' },
      { name: 'Ryż brązowy', amount: '200', unit: 'g' },
      { name: 'Brokuł', amount: '300', unit: 'g' },
      { name: 'Marchew', amount: '2', unit: 'szt' },
      { name: 'Sos sojowy', amount: '2', unit: 'łyżki' },
      { name: 'Czosnek', amount: '2', unit: 'ząbki' },
      { name: 'Oliwa z oliwek', amount: '2', unit: 'łyżki' },
    ],
    steps: [
      'Ugotuj ryż wg instrukcji na opakowaniu.',
      'Kurczaka pokrój w kostkę i marynuj w sosie sojowym z czosnkiem 10 min.',
      'Brokuła podziel na różyczki, marchew pokrój w plasterki.',
      'Podsmaż kurczaka na oliwie 5-6 min, odłóż.',
      'Na tym samym patelni smaż warzywa 4-5 min.',
      'Połącz kurczaka z warzywami, podaj z ryżem.',
    ],
    tags: ['obiad', 'wysokobiałkowe', 'fit'],
    is_seafood: 0,
    macros: { kcal: 550, protein_g: 48, carbs_g: 58, fat_g: 12 },
    macros_confidence: 'high',
  },
  {
    id: 5,
    title: 'Łosoś pieczony z cytryną i szparagami',
    slug: 'losos-pieczony-szparagi',
    category: 'dinner',
    servings: 2,
    prep_minutes: 25,
    ingredients: [
      { name: 'Filet z łososia', amount: '400', unit: 'g' },
      { name: 'Szparagi', amount: '300', unit: 'g' },
      { name: 'Cytryna', amount: '1', unit: 'szt' },
      { name: 'Czosnek', amount: '2', unit: 'ząbki' },
      { name: 'Oliwa z oliwek', amount: '2', unit: 'łyżki' },
      { name: 'Koperek', amount: '1', unit: 'garść' },
    ],
    steps: [
      'Rozgrzej piekarnik do 200°C.',
      'Łososia ułóż na blasze wyłożonej papierem.',
      'Posmaruj oliwą, posyp czosnkiem, sokiem z cytryny.',
      'Obok ułóż szparagi, polej oliwą.',
      'Piecz 18-20 minut. Posyp koperkiem.',
    ],
    tags: ['kolacja', 'owoce morza', 'omega-3', 'fit'],
    is_seafood: 1,
    macros: { kcal: 420, protein_g: 42, carbs_g: 8, fat_g: 24 },
    macros_confidence: 'high',
  },
  {
    id: 6,
    title: 'Zupa krem z dyni',
    slug: 'zupa-krem-dyni',
    category: 'soup',
    servings: 4,
    prep_minutes: 40,
    ingredients: [
      { name: 'Dynia', amount: '1', unit: 'kg' },
      { name: 'Cebula', amount: '2', unit: 'szt' },
      { name: 'Czosnek', amount: '3', unit: 'ząbki' },
      { name: 'Bulion warzywny', amount: '800', unit: 'ml' },
      { name: 'Mleko kokosowe', amount: '200', unit: 'ml' },
      { name: 'Imbir', amount: '2', unit: 'cm' },
      { name: 'Oliwa z oliwek', amount: '2', unit: 'łyżki' },
    ],
    steps: [
      'Pokrój dynię w kostkę, cebulę i czosnek posiekaj.',
      'Podsmaż cebulę i czosnek na oliwie 3 minuty.',
      'Dodaj dynię i imbir, smaż 5 minut.',
      'Zalej bulionem, gotuj 20 minut.',
      'Zblenduj na krem, dodaj mleko kokosowe.',
      'Podgrzej i dopraw solą i pieprzem.',
    ],
    tags: ['zupa', 'wegetariańskie', 'wegańskie'],
    is_seafood: 0,
    macros: { kcal: 180, protein_g: 3, carbs_g: 28, fat_g: 8 },
    macros_confidence: 'high',
  },
  {
    id: 7,
    title: 'Sałatka z tuńczykiem i awokado',
    slug: 'salatka-tunczyk-awokado',
    category: 'salad',
    servings: 2,
    prep_minutes: 15,
    ingredients: [
      { name: 'Tuńczyk w puszce', amount: '2', unit: 'puszki' },
      { name: 'Awokado', amount: '1', unit: 'szt' },
      { name: 'Ogórek', amount: '1', unit: 'szt' },
      { name: 'Pomidor', amount: '2', unit: 'szt' },
      { name: 'Oliwa z oliwek', amount: '2', unit: 'łyżki' },
      { name: 'Sok z cytryny', amount: '1', unit: 'łyżka' },
    ],
    steps: [
      'Odsącz tuńczyka.',
      'Awokado, ogórek i pomidory pokrój w kostkę.',
      'Połącz wszystkie składniki w misce.',
      'Polej oliwą i sokiem z cytryny, dopraw.',
    ],
    tags: ['sałatka', 'owoce morza', 'fit', 'szybkie'],
    is_seafood: 1,
    macros: { kcal: 380, protein_g: 32, carbs_g: 12, fat_g: 22 },
    macros_confidence: 'high',
  },
  {
    id: 8,
    title: 'Pasta z ciecierzycy (hummus)',
    slug: 'hummus',
    category: 'snack',
    servings: 4,
    prep_minutes: 10,
    ingredients: [
      { name: 'Ciecierzyca konserwowa', amount: '400', unit: 'g' },
      { name: 'Tahini', amount: '2', unit: 'łyżki' },
      { name: 'Czosnek', amount: '2', unit: 'ząbki' },
      { name: 'Sok z cytryny', amount: '3', unit: 'łyżki' },
      { name: 'Oliwa z oliwek', amount: '3', unit: 'łyżki' },
      { name: 'Kumin', amount: '0.5', unit: 'łyżeczki' },
    ],
    steps: [
      'Odsącz i opłucz ciecierzycę.',
      'Wrzuć ciecierzycę, tahini, czosnek, sok z cytryny do blendera.',
      'Blenduj dodając stopniowo oliwę.',
      'Dopraw solą i kuminem.',
      'Podawaj z oliwą i papryką na wierzchu.',
    ],
    tags: ['przekąska', 'wegetariańskie', 'wegańskie'],
    is_seafood: 0,
    macros: { kcal: 210, protein_g: 8, carbs_g: 22, fat_g: 11 },
    macros_confidence: 'high',
  },
  {
    id: 9,
    title: 'Makaron pełnoziarnisty z pesto i pomidorami',
    slug: 'makaron-pesto-pomidory',
    category: 'lunch',
    servings: 2,
    prep_minutes: 20,
    ingredients: [
      { name: 'Makaron pełnoziarnisty', amount: '200', unit: 'g' },
      { name: 'Pesto bazyliowe', amount: '4', unit: 'łyżki' },
      { name: 'Pomidorki koktajlowe', amount: '200', unit: 'g' },
      { name: 'Parmezan', amount: '30', unit: 'g' },
      { name: 'Rukola', amount: '40', unit: 'g' },
    ],
    steps: [
      'Ugotuj makaron al dente wg instrukcji.',
      'Pomidorki przekrój na pół.',
      'Odcedź makaron, zachowaj 50 ml wody.',
      'Wymieszaj gorący makaron z pesto i wodą z gotowania.',
      'Dodaj pomidorki i rukolę, posyp parmezanem.',
    ],
    tags: ['obiad', 'wegetariańskie', 'włoskie'],
    is_seafood: 0,
    macros: { kcal: 520, protein_g: 18, carbs_g: 68, fat_g: 20 },
    macros_confidence: 'high',
  },
  {
    id: 10,
    title: 'Tofu stir-fry z warzywami',
    slug: 'tofu-stir-fry',
    category: 'dinner',
    servings: 2,
    prep_minutes: 25,
    ingredients: [
      { name: 'Tofu twarde', amount: '400', unit: 'g' },
      { name: 'Brokuł', amount: '200', unit: 'g' },
      { name: 'Marchew', amount: '1', unit: 'szt' },
      { name: 'Papryka', amount: '1', unit: 'szt' },
      { name: 'Sos sojowy', amount: '3', unit: 'łyżki' },
      { name: 'Ryż jaśminowy', amount: '200', unit: 'g' },
    ],
    steps: [
      'Ugotuj ryż. Osusz tofu i pokrój w kostkę.',
      'Podsmaż tofu na oleju do złotości, odłóż.',
      'Na tym samym patelni podsmaż czosnek i imbir.',
      'Dodaj warzywa, smaż 4-5 min.',
      'Dodaj tofu i sos sojowy, mieszaj 2 min.',
      'Skrop olejem sezamowym. Podaj z ryżem.',
    ],
    tags: ['kolacja', 'wegetariańskie', 'wegańskie', 'azjatyckie'],
    is_seafood: 0,
    macros: { kcal: 480, protein_g: 28, carbs_g: 62, fat_g: 12 },
    macros_confidence: 'high',
  },
  {
    id: 11,
    title: 'Tost z awokado i jajkiem w koszulce',
    slug: 'tost-awokado-jajko',
    category: 'breakfast',
    servings: 1,
    prep_minutes: 15,
    ingredients: [
      { name: 'Chleb żytni', amount: '2', unit: 'kromki' },
      { name: 'Awokado', amount: '1', unit: 'szt' },
      { name: 'Jajka', amount: '2', unit: 'szt' },
      { name: 'Sok z cytryny', amount: '1', unit: 'łyżeczka' },
      { name: 'Płatki chili', amount: '', unit: 'szczypta' },
    ],
    steps: [
      'Opiecz chleb w tosterze.',
      'Rozgnieć awokado, dopraw sokiem z cytryny, solą i pieprzem.',
      'W garnku zagotuj wodę z octem. Rozbij jajko do filiżanki.',
      'Wpuść jajko delikatnie do wiru wody. Gotuj 3 min.',
      'Posmaruj tosty awokado, ułóż jajko. Posyp chili.',
    ],
    tags: ['śniadanie', 'wegetariańskie', 'fit'],
    is_seafood: 0,
    macros: { kcal: 420, protein_g: 20, carbs_g: 32, fat_g: 24 },
    macros_confidence: 'high',
  },
  {
    id: 12,
    title: 'Zupa minestrone',
    slug: 'zupa-minestrone',
    category: 'soup',
    servings: 4,
    prep_minutes: 45,
    ingredients: [
      { name: 'Pomidory krojone (puszka)', amount: '400', unit: 'g' },
      { name: 'Fasola biała (puszka)', amount: '400', unit: 'g' },
      { name: 'Cukinia', amount: '1', unit: 'szt' },
      { name: 'Marchew', amount: '2', unit: 'szt' },
      { name: 'Makaron mały', amount: '100', unit: 'g' },
      { name: 'Bulion warzywny', amount: '1', unit: 'l' },
    ],
    steps: [
      'Pokrój wszystkie warzywa w kostkę.',
      'Podsmaż czosnek i seler na oliwie 3 min.',
      'Dodaj marchew i cukinie, smaż 5 min.',
      'Wlej bulion i pomidory, gotuj 15 min.',
      'Dodaj fasolę i makaron, gotuj 10 min.',
      'Dopraw i podaj z bazylią.',
    ],
    tags: ['zupa', 'wegetariańskie', 'wegańskie', 'włoskie'],
    is_seafood: 0,
    macros: { kcal: 220, protein_g: 10, carbs_g: 38, fat_g: 4 },
    macros_confidence: 'high',
  },
  {
    id: 13,
    title: 'Placuszki bananowe',
    slug: 'placuszki-bananowe',
    category: 'breakfast',
    servings: 2,
    prep_minutes: 20,
    ingredients: [
      { name: 'Banany', amount: '2', unit: 'szt' },
      { name: 'Jajka', amount: '2', unit: 'szt' },
      { name: 'Mąka owsiana', amount: '60', unit: 'g' },
      { name: 'Proszek do pieczenia', amount: '0.5', unit: 'łyżeczki' },
      { name: 'Masło', amount: '1', unit: 'łyżka' },
    ],
    steps: [
      'Rozgnieć banany widelcem.',
      'Dodaj jajka i wymieszaj.',
      'Wsyp mąkę i proszek do pieczenia, mieszaj do gładkości.',
      'Smaż placuszki na maśle po 2-3 min z każdej strony.',
    ],
    tags: ['śniadanie', 'wegetariańskie', 'szybkie', 'fit'],
    is_seafood: 0,
    macros: { kcal: 340, protein_g: 14, carbs_g: 52, fat_g: 10 },
    macros_confidence: 'high',
  },
  {
    id: 14,
    title: 'Grillowany halloumi z sałatką',
    slug: 'halloumi-salatka',
    category: 'lunch',
    servings: 2,
    prep_minutes: 20,
    ingredients: [
      { name: 'Halloumi', amount: '250', unit: 'g' },
      { name: 'Mix sałat', amount: '100', unit: 'g' },
      { name: 'Pomidorki koktajlowe', amount: '200', unit: 'g' },
      { name: 'Ogórek', amount: '1', unit: 'szt' },
      { name: 'Oliwki', amount: '50', unit: 'g' },
      { name: 'Oliwa z oliwek', amount: '2', unit: 'łyżki' },
    ],
    steps: [
      'Pokrój halloumi w plastry o grubości 1 cm.',
      'Grilluj bez tłuszczu po 2-3 min z każdej strony.',
      'Przygotuj sałatkę z pozostałych składników.',
      'Polej oliwą i octem balsamicznym.',
      'Ułóż gorące halloumi na sałatce.',
    ],
    tags: ['obiad', 'wegetariańskie', 'śródziemnomorskie'],
    is_seafood: 0,
    macros: { kcal: 480, protein_g: 28, carbs_g: 12, fat_g: 36 },
    macros_confidence: 'high',
  },
  {
    id: 15,
    title: 'Chili sin carne',
    slug: 'chili-sin-carne',
    category: 'dinner',
    servings: 4,
    prep_minutes: 40,
    ingredients: [
      { name: 'Soczewica czerwona', amount: '200', unit: 'g' },
      { name: 'Fasola czerwona (puszka)', amount: '400', unit: 'g' },
      { name: 'Pomidory krojone (puszka)', amount: '800', unit: 'g' },
      { name: 'Cebula', amount: '2', unit: 'szt' },
      { name: 'Czosnek', amount: '4', unit: 'ząbki' },
      { name: 'Kumin', amount: '2', unit: 'łyżeczki' },
    ],
    steps: [
      'Podsmaż cebulę i czosnek na oliwie.',
      'Dodaj przyprawy i chili, smaż 1 min.',
      'Dodaj soczewicę, pomidory i 400 ml wody.',
      'Gotuj 20 minut.',
      'Dodaj fasolę, gotuj kolejne 10 min.',
      'Podaj z ryżem lub chlebem.',
    ],
    tags: ['kolacja', 'wegetariańskie', 'wegańskie', 'meksykańskie'],
    is_seafood: 0,
    macros: { kcal: 320, protein_g: 18, carbs_g: 52, fat_g: 5 },
    macros_confidence: 'high',
  },
  {
    id: 16,
    title: 'Krewetki smażone z czosnkiem i natką',
    slug: 'krewetki-czosnek-natka',
    category: 'dinner',
    servings: 2,
    prep_minutes: 15,
    ingredients: [
      { name: 'Krewetki mrożone', amount: '400', unit: 'g' },
      { name: 'Czosnek', amount: '4', unit: 'ząbki' },
      { name: 'Masło', amount: '2', unit: 'łyżki' },
      { name: 'Natka pietruszki', amount: '1', unit: 'garść' },
      { name: 'Sok z cytryny', amount: '1', unit: 'łyżka' },
    ],
    steps: [
      'Rozmroź krewetki i osusz papierowym ręcznikiem.',
      'Rozgrzej oliwę i masło na patelni.',
      'Podsmaż czosnek 30 sekund.',
      'Dodaj krewetki, smaż po 2 min z każdej strony.',
      'Skrop sokiem z cytryny, posyp natką.',
    ],
    tags: ['kolacja', 'owoce morza', 'szybkie'],
    is_seafood: 1,
    macros: { kcal: 280, protein_g: 38, carbs_g: 3, fat_g: 14 },
    macros_confidence: 'high',
  },
  {
    id: 17,
    title: 'Batonik proteinowy owocowy',
    slug: 'batonik-proteinowy',
    category: 'snack',
    servings: 8,
    prep_minutes: 15,
    ingredients: [
      { name: 'Płatki owsiane', amount: '200', unit: 'g' },
      { name: 'Odżywka białkowa waniliowa', amount: '60', unit: 'g' },
      { name: 'Masło orzechowe', amount: '80', unit: 'g' },
      { name: 'Miód', amount: '60', unit: 'g' },
      { name: 'Suszone żurawiny', amount: '50', unit: 'g' },
    ],
    steps: [
      'Wymieszaj płatki, odżywkę i żurawiny.',
      'Podgrzej masło orzechowe z miodem do połączenia.',
      'Wymieszaj suche składniki z masą orzechową.',
      'Wyłóż do formy wyłożonej papierem, ugnij.',
      'Chłodź w lodówce minimum 2 godz, pokrój w batoniki.',
    ],
    tags: ['przekąska', 'wegetariańskie', 'sportowe', 'prep'],
    is_seafood: 0,
    macros: { kcal: 210, protein_g: 12, carbs_g: 26, fat_g: 7 },
    macros_confidence: 'high',
  },
  {
    id: 18,
    title: 'Twaróg z owocami i granolą',
    slug: 'twarog-owoce-granola',
    category: 'breakfast',
    servings: 1,
    prep_minutes: 5,
    ingredients: [
      { name: 'Twaróg półtłusty', amount: '200', unit: 'g' },
      { name: 'Truskawki lub maliny', amount: '100', unit: 'g' },
      { name: 'Granola', amount: '30', unit: 'g' },
      { name: 'Miód', amount: '1', unit: 'łyżeczka' },
    ],
    steps: [
      'Przełóż twaróg do miski.',
      'Dodaj owoce i granolę.',
      'Skrop miodem.',
    ],
    tags: ['śniadanie', 'wegetariańskie', 'szybkie', 'fit'],
    is_seafood: 0,
    macros: { kcal: 350, protein_g: 26, carbs_g: 44, fat_g: 7 },
    macros_confidence: 'high',
  },
]

const breakfastIds = [1, 2, 3, 11, 13, 18]
const lunchIds = [4, 9, 14]
const dinnerIds = [5, 10, 15, 16]
const snackIds = [8, 17]

function getDay(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset - 14)
  return d.toISOString().slice(0, 10)
}

const plan = []
for (let day = 0; day < 30; day++) {
  const date = getDay(day)
  plan.push({ date, meal_type: 'breakfast', recipe_id: breakfastIds[day % breakfastIds.length], servings: 1, status: 'planned' })
  plan.push({ date, meal_type: 'lunch', recipe_id: lunchIds[day % lunchIds.length], servings: 2, status: 'planned' })
  plan.push({ date, meal_type: 'dinner', recipe_id: dinnerIds[day % dinnerIds.length], servings: 2, status: 'planned' })
  if (day % 2 === 0) {
    plan.push({ date, meal_type: 'snack', recipe_id: snackIds[day % snackIds.length], servings: 1, status: 'planned' })
  }
}

function q(s) { return String(s ?? '').replace(/'/g, "''") }

let sql = `DELETE FROM meal_plan_entries;\nDELETE FROM recipes;\nDELETE FROM settings WHERE key = 'app';\n\n`

for (const r of recipes) {
  sql += `INSERT INTO recipes (id, title, slug, category, servings, prep_minutes, ingredients, steps, tags, is_seafood, macros, macros_confidence) VALUES (${r.id}, '${q(r.title)}', '${q(r.slug)}', '${q(r.category)}', ${r.servings}, ${r.prep_minutes}, '${q(JSON.stringify(r.ingredients))}', '${q(JSON.stringify(r.steps))}', '${q(JSON.stringify(r.tags))}', ${r.is_seafood}, '${q(JSON.stringify(r.macros))}', '${q(r.macros_confidence)}');\n`
}
sql += '\n'

for (const e of plan) {
  sql += `INSERT INTO meal_plan_entries (date, meal_type, recipe_id, servings, status) VALUES ('${e.date}', '${e.meal_type}', ${e.recipe_id}, ${e.servings}, '${e.status}');\n`
}

const appSettings = JSON.stringify({ kcal_target: 2300, protein_g_target: 150, water_glasses_target: 8, timezone: 'Europe/Warsaw', seafood_enabled: true, theme: 'auto' })
sql += `\nINSERT INTO settings (key, value) VALUES ('app', '${q(appSettings)}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;\n`

const tmpFile = '/tmp/matkaboska_seed.sql'
writeFileSync(tmpFile, sql)

try {
  execSync(`npx wrangler d1 execute meal-planner-db ${flag} --file ${tmpFile}`, { stdio: 'inherit' })
  console.log('✅ Seed complete!')
} finally {
  try { unlinkSync(tmpFile) } catch {}
}
