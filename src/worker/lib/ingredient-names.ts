/**
 * One canonical grocery name per product.
 *
 * Recipe ingredient names arrive in whatever form their source used: Polish
 * declensions ("ciecierzycy", "cebuli"), qualifiers ("kostka tofu wędzonego,
 * niekoniecznie"), or plain serving suggestions ("do podania: pieczywo"). The
 * shopping list aggregates by name, so every variant became its own line —
 * three entries for chickpeas, two for onion.
 *
 * Rules are ordered and the first match wins, so specific patterns must precede
 * general ones. Two ordering traps are called out inline: an unanchored /mąka/
 * also matches "MAKAron", and /orzech/ also matches "masło orzechowe".
 *
 * A null target means "not a purchase" — water and serving suggestions are
 * dropped. An unmatched name passes through unchanged, so an unknown ingredient
 * is never silently renamed.
 */
const RULES: [RegExp, string | null][] = [
  // --- pure instructions / serving suggestions -> dropped ------------------
  [/^do podania/i, null],
  [/^oraz do podania/i, null],
  [/^do posypania/i, null],
  [/^opcjonalnie:/i, null],
  [/^kilka ga[łl][ąa]zek ulubionych zi/i, null],
  [/zero dressing/i, null],
  [/^woda$|^wody$|zimnej wody|szklanki wody|szklanka wody|g \(ml\) wody|troch[ęe] wody/i, null],

  // --- herbs & aromatics (before broader matches) --------------------------
  [/natki pietruszki|natka pietruszki|[łl]ody[żz]ek pietruszki|^pietruszka$|garść pietruszki/i, 'Natka pietruszki'],
  [/pietruszki, suszonego/i, 'Pietruszka suszona'],
  [/korze[ńn] pietruszki/i, 'Korzeń pietruszki'],
  [/szczypior|szczypiorek/i, 'Szczypiorek'],
  [/koperk|koperek/i, 'Koperek'],
  [/li[śs]ci curry|li[śs]ć curry/i, 'Liście curry'],
  [/kolendry, mielon|mielonej kolendry|mielonych ziaren kolendry|kolendra mielona/i, 'Kolendra mielona'],
  [/[łl]ody[żz]ek kolendry|gar[śs][ćc] kolendry|[śs]wie[żz]a kolendra/i, 'Kolendra świeża'],
  [/mi[ęe]ty|mi[ęe]ta/i, 'Mięta'],
  [/sza[łl]wi/i, 'Szałwia'],
  [/rozmaryn/i, 'Rozmaryn'],
  [/bazyli/i, 'Bazylia suszona'],
  [/tymianku|tymianek/i, 'Tymianek'],
  [/oregano/i, 'Oregano'],
  [/majeranku|majeranek/i, 'Majeranek'],
  [/cz[ąa]bru|cz[ąa]ber/i, 'Cząber'],
  [/lubczyk/i, 'Lubczyk'],
  [/li[śs]cie laurowe|li[śs][ćc] laurowy/i, 'Liść laurowy'],
  [/ziela angielskiego|ziele angielskie/i, 'Ziele angielskie'],
  [/gwiazdka anyżu|any[żz]u/i, 'Anyż gwiazdkowy'],
  [/kozieradk/i, 'Kozieradka'],
  [/gorczyc/i, 'Gorczyca'],
  [/karobu|karob/i, 'Karob'],
  [/kakao/i, 'Kakao'],

  // --- spices ---------------------------------------------------------------
  [/w[ęe]dzonej papryki|papryki w[ęe]dzonej|papryka w[ęe]dzona|s[łl]odkiej papryki w[ęe]dzonej/i, 'Papryka wędzona'],
  [/ostrej papryki|papryki ostrej|cayenne/i, 'Papryka ostra'],
  [/s[łl]odkiej papryki|papryki s[łl]odkiej|s[łl]odka papryka|papryki w proszku/i, 'Papryka słodka'],
  [/gochugaru/i, 'Gochugaru'],
  [/p[łl]atk[óo]w chili|papryczki chili|^chili$|chili w proszku|p[łl]atki chili/i, 'Chili'],
  [/jalape[ńñn]o/i, 'Papryczka jalapeño'],
  [/kurkum/i, 'Kurkuma'],
  [/kuminu|kumin/i, 'Kumin'],
  [/kminku|kminek/i, 'Kminek'],
  [/cynamon/i, 'Cynamon'],
  [/curry w proszku|pasty curry|pasta curry/i, 'Pasta curry'],
  [/tamaryndowca/i, 'Pasta tamaryndowa'],
  [/czarna s[óo]l|kala namak/i, 'Czarna sól (kala namak)'],
  [/^s[óo]l|s[óo]l jodowana|s[óo]l i (czarny )?pieprz|s[óo]l do smaku|s[óo]l,|szczypta soli/i, 'Sól'],
  [/pieprz/i, 'Pieprz czarny'],
  [/cebuli suszonej w proszku|cebuli w proszku/i, 'Cebula w proszku'],
  [/czosnku w proszku/i, 'Czosnek w proszku'],
  [/imbir/i, 'Imbir'],

  // --- vegetables -----------------------------------------------------------
  // These two must precede 'marchew' and 'kukurydz', which would otherwise
  // swallow them: a starch is not sweetcorn, and a frozen medley is not a carrot.
  [/skrobi kukurydzianej|skrobia kukurydziana/i, 'Skrobia kukurydziana'],
  [/warzyw mro[żz]onych|warzywa mro[żz]one/i, 'Warzywa mrożone'],
  [/cebulki m[łl]ode|cebulka|cebulki/i, 'Cebula młoda'],
  [/cebul\w* czerwon|czerwonej cebuli/i, 'Cebula czerwona'],
  [/cebul/i, 'Cebula'],
  [/czosn/i, 'Czosnek'],
  [/marchew|marchewk/i, 'Marchew'],
  [/selera naciowego|laska selera|[łl]odygi selera/i, 'Seler naciowy'],
  [/batat/i, 'Batat'],
  [/ziemniak/i, 'Ziemniaki'],
  [/pomidor[óo]w krojonych|pomidory krojone|krojonych pomidor[óo]w w puszce/i, 'Pomidory krojone (puszka)'],
  [/passaty|przecieru pomidorowego|przecier pomidorowy/i, 'Passata pomidorowa'],
  [/koncentratu pomidorowego|koncentrat pomidorowy/i, 'Koncentrat pomidorowy'],
  [/sosu pomidorowego|ketchup/i, 'Sos pomidorowy'],
  [/suszonych pomidor|suszone pomidory/i, 'Pomidory suszone'],
  [/pomidork[óo]w koktajlowych|pomidorki koktajlowe/i, 'Pomidorki koktajlowe'],
  [/pomidor malinowy|^pomidory$|du[żz]e pomidory|^pomidor$/i, 'Pomidory'],
  [/papryka [żz][óo][łl]ta|papryka [żz][óo][łl]ta lub pomara[ńn]czowa|du[żz]a papryka [żz]/i, 'Papryka żółta'],
  [/papryka czerwona|papryki: czerwona|papryka czerwona lub [żz][óo][łl]ta|^papryki$/i, 'Papryka czerwona'],
  [/broku[łl]/i, 'Brokuł'],
  [/gnocchi/i, 'Gnocchi'],
  [/kalafior/i, 'Kalafior'],
  [/szpinaku baby|szpinak baby/i, 'Szpinak baby'],
  [/szpinak/i, 'Szpinak'],
  [/rukoli|rukola/i, 'Rukola'],
  [/sa[łl]ata rzymska/i, 'Sałata rzymska'],
  [/rzodkiew/i, 'Rzodkiewka'],
  [/cukini/i, 'Cukinia'],
  [/pur[ée]e z dyni|dyni\b/i, 'Dynia'],
  [/burak/i, 'Buraki'],
  [/soku z kiszonej kapusty/i, 'Sok z kiszonej kapusty'],
  [/og[óo]rek kiszony|og[óo]rka kiszonego/i, 'Ogórek kiszony'],
  [/awokado/i, 'Awokado'],
  [/bobu|^b[óo]b$/i, 'Bób'],
  [/edamame/i, 'Edamame'],
  [/groszku konserwowego|groszek konserwowy/i, 'Groszek konserwowy'],
  [/kukurydz/i, 'Kukurydza konserwowa'],
  [/pieczar/i, 'Pieczarki'],
  [/suszonych grzyb[óo]w|suszone grzyby/i, 'Grzyby suszone'],
  [/grzyb[óo]w/i, 'Pieczarki'],
  [/sk[óo]rk\w* (z |otartej z |obranej z )?cytryn|sk[óo]rka starta z [ćc]wiartki cytryny/i, 'Cytryna'],
  [/soku z cytryny|sok z cytryny|soku z cytryny \/ limonki|octu winnego lub soku z cytryny/i, 'Cytryna'],
  [/limonk/i, 'Limonka'],

  // --- legumes & protein ----------------------------------------------------
  [/zielona lub br[ąa]zowa soczewica|soczewic\w* (zielon|br[ąa]zow)/i, 'Soczewica brązowa'],
  [/ciecierzyc|cieciork/i, 'Ciecierzyca konserwowa'],
  [/fasoli czerwonej|czerwonej fasoli|fasola czerwona/i, 'Czerwona fasola (puszka)'],
  [/bia[łl]ej fasoli|biala fasola/i, 'Biała fasola (puszka)'],
  [/czarnej fasoli/i, 'Czarna fasola (puszka)'],
  [/fasoli, dowolnej|^fasoli$|fasoli z puszki/i, 'Fasola (puszka)'],
  [/soczewicy czerwonej|soczewica czerwona|soczewicy czerwonej lub [żz][óo][łl]tej/i, 'Soczewica czerwona'],
  [/soczewicy br[ąa]zowej|soczewicy br[ąa]zowej \/ zielonej/i, 'Soczewica brązowa'],
  [/grochu [żz][óo][łl]tego/i, 'Groch łuskany'],
  [/kotlet[óo]w sojowych/i, 'Kotlety sojowe'],
  [/tofu w[ęe]dzon/i, 'Tofu wędzone'],
  [/pasta z tofu/i, 'Pasta z tofu i nerkowców'],
  [/tofu/i, 'Tofu naturalne'],
  [/tempehu w[ęe]dzonego/i, 'Tempeh wędzony'],
  [/tempeh/i, 'Tempeh'],
  [/jajk|jajo/i, 'Jajka'],
  [/chudego twarogu|lekkiego twarogu|beztłuszczowego twarogu|mi[ęe]kkiego, beztłuszczowego twarogu/i, 'Twaróg chudy'],
  [/twarogu|twar[óo]g/i, 'Twaróg'],
  [/parmezan/i, 'Parmezan'],
  [/cheddar/i, 'Ser cheddar'],
  [/jogurtu sojowego|jogurt sojowy/i, 'Jogurt sojowy'],
  [/czekoladowego bia[łl]ka|od[żz]ywk/i, 'Odżywka białkowa'],
  [/p[łl]atk[óo]w dro[żz]d[żz]owych|p[łl]atki dro[żz]d[żz]owe|^dro[żz]d[żz]y$/i, 'Płatki drożdżowe'],
  [/majonezu|majonez/i, 'Majonez wegański'],

  // --- grains, flours, breads ----------------------------------------------
  [/makaronu bia[łl]kowego|makaron bia[łl]kowy/i, 'Makaron białkowy'],
  [/makaronu spaghetti|spaghetti/i, 'Makaron spaghetti'],
  [/komosy ry[żz]owej|komosa ry[żz]owa/i, 'Komosa ryżowa'],
  [/ry[żz]/i, 'Ryż'],
  [/p[łl]atk[óo]w owsianych|p[łl]atki owsiane/i, 'Płatki owsiane'],
  [/m[ąa]ki owsianej/i, 'Mąka owsiana'],
  [/m[ąa]ki ziemniaczanej|m[ąa]ka ziemniaczana/i, 'Mąka ziemniaczana'],
  [/m[ąa]k\w* owsian/i, 'Mąka owsiana'],
  [/m[ąa]k\w* orkiszow/i, 'Mąka orkiszowa'],
  // Word-bounded: an unanchored /mąka/ also matches "MAKAron".
  [/(^|\s)m[ąa]k[ai]\b/i, 'Mąka pszenna'],
  [/makaron/i, 'Makaron'],
  [/bu[łl]ki tartej|bu[łl]ka tarta/i, 'Bułka tarta'],
  [/chleba na zakwasie/i, 'Chleb na zakwasie'],
  [/pieczywo pe[łl]noziarniste|chleb pe[łl]noziarnisty/i, 'Pieczywo pełnoziarniste'],
  [/wrap/i, 'Wrapy'],
  [/proszek do pieczenia|proszku do pieczenia/i, 'Proszek do pieczenia'],

  // --- fats, nuts, seeds, sweeteners ---------------------------------------
  [/oliwy z oliwek|oliwa z oliwek/i, 'Oliwa z oliwek'],
  [/oleju sezamowego|olej sezamowy/i, 'Olej sezamowy'],
  [/olej rzepakowy/i, 'Olej rzepakowy'],
  [/olej ro[śs]linny|oleju|^olej/i, 'Olej rzepakowy'],
  [/^oliwy$|^oliwa$/i, 'Oliwa z oliwek'],
  [/tahin/i, 'Tahini'],
  [/nerkowc/i, 'Nerkowce'],
  [/orzech[óo]w ziemnych|fistasz/i, 'Orzeszki ziemne'],
  [/mas[łl]o orzechowe|mas[łl]a orzechowego/i, 'Masło orzechowe'],
  [/orzech/i, 'Orzechy'],
  [/pestki dyni|pestek dyni/i, 'Pestki dyni'],
  [/sezam/i, 'Sezam'],
  [/nasion chia|nasiona chia/i, 'Nasiona chia'],
  [/mleka kokosowego|mleko kokosowe|kokosowego mlecz|mleczka kokosowego|kokosowego mleka/i, 'Mleko kokosowe'],
  [/mleka ro[śs]linnego|mleko ro[śs]linne|mleka owsianego/i, 'Mleko roślinne'],
  [/odt[łl]uszczonego mleka|mleka p[óo][łl]t[łl]ustego|^mleka$|^mleko$/i, 'Mleko'],
  [/syropu klonowego|syrop klonowy/i, 'Syrop klonowy'],
  [/syropu z agawy|syrop z agawy/i, 'Syrop z agawy'],
  [/cukru trzcinowego|cukier trzcinowy/i, 'Cukier trzcinowy'],
  [/powide[łl] [śs]liwkowych|powid[łl]a [śs]liwkowe/i, 'Powidła śliwkowe'],
  [/czekolady|czekolada/i, 'Czekolada gorzka'],
  [/malin|maliny/i, 'Maliny'],
  [/kokosowy aminos|kokosowego aminos/i, 'Kokosowy aminos'],

  // --- condiments & stocks --------------------------------------------------
  [/wi[óo]rki kokosowe/i, 'Wiórki kokosowe'],
  [/pomara[ńn]cz/i, 'Pomarańcza'],
  [/filet\w*( z)? [łl]ososia|[łl]oso[śs]/i, 'Filet z łososia'],
  [/^woda lub mleko$/i, 'Mleko'],
  [/^mi[óo]d/i, 'Miód'],
  [/czarnuszk/i, 'Czarnuszka'],
  [/[żz]urawin/i, 'Żurawina suszona'],
  [/mozzarell/i, 'Mozzarella'],
  [/kasza gryczan|kaszy gryczanej/i, 'Kasza gryczana'],
  [/sosu sojowego|sos sojowy/i, 'Sos sojowy'],
  [/musztard/i, 'Musztarda'],
  [/octu ry[żz]owego|ocet ry[żz]owy/i, 'Ocet ryżowy'],
  [/octu winnego|ocet winny|czerwonego octu winnego/i, 'Ocet winny'],
  [/bulionu warzywnego|bulion warzywny|bulionu lub wody|^bulionu$|^bulion$/i, 'Bulion warzywny'],
]

/** Canonical grocery name, or null when the line is not something to buy. */
export function canonicalIngredientName(raw: string): string | null {
  const s = (raw || '').trim()
  if (!s) return null
  for (const [re, target] of RULES) {
    if (re.test(s)) return target
  }
  return s
}
