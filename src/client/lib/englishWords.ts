// Words for the English flashcard shown on app launch. Pronunciation is
// American English (IPA); `tip` is a hint for a Polish speaker.
export type EnglishWord = {
  word: string
  ipa: string
  pos: string
  pl: string
  example: string
  tip?: string
  /** true = word from my own list; false = surprise word picked to match it */
  own?: boolean
}

export const MY_WORDS: EnglishWord[] = [
  { word: 'violate', ipa: '/ˈvaɪəleɪt/', pos: 'verb', pl: 'naruszać, łamać (zasady, przepisy)', example: 'This change violates our security policy.', tip: 'VAI-ə-lejt, akcent na pierwszą sylabę; „violates” = VAI-ə-lejts' },
  { word: 'vulnerability', ipa: '/ˌvʌlnərəˈbɪləti/', pos: 'noun', pl: 'podatność, luka (bezpieczeństwa); wrażliwość', example: 'The scan found two critical vulnerabilities.', tip: 'wal-nə-rə-BI-lə-ti, akcent na BI' },
  { word: 'refinement', ipa: '/rɪˈfaɪnmənt/', pos: 'noun', pl: 'dopracowanie, udoskonalenie; (agile) doprecyzowanie zadań', example: 'Let’s take this ticket to backlog refinement.', tip: 'ri-FAJN-mənt' },
  { word: 'business', ipa: '/ˈbɪznəs/', pos: 'noun', pl: 'biznes, firma; sprawa', example: 'That’s none of my business.', tip: 'dwie sylaby: BIZ-nəs — nie „biz-ness” ani „bu-si-ness”' },
  { word: 'engineering', ipa: '/ˌendʒɪˈnɪrɪŋ/', pos: 'noun', pl: 'inżynieria; dział techniczny', example: 'Engineering will ship the fix next week.', tip: 'en-dżi-NIR-ing, akcent na NIR, nie na początek' },
  { word: 'Wednesday', ipa: '/ˈwenzdeɪ/', pos: 'noun', pl: 'środa', example: 'The release is planned for Wednesday.', tip: 'WENZ-dej — pierwsze „d” jest nieme' },
  { word: 'although', ipa: '/ɔːlˈðoʊ/', pos: 'conjunction', pl: 'chociaż, mimo że', example: 'Although it works, the code is hard to read.', tip: 'ol-ÐOU, „th” dźwięczne jak w „the”, „gh” nieme' },
  { word: 'intrinsic', ipa: '/ɪnˈtrɪnsɪk/', pos: 'adjective', pl: 'wewnętrzny, nieodłączny, z natury', example: 'Intrinsic motivation lasts longer than bonuses.', tip: 'in-TRIN-sik' },
  { word: 'tangible', ipa: '/ˈtændʒəbəl/', pos: 'adjective', pl: 'namacalny, wymierny, konkretny', example: 'We need tangible results by the end of the quarter.', tip: 'TEN-dżə-bəl, „a” jak w „cat”' },
  { word: 'intangible', ipa: '/ɪnˈtændʒəbəl/', pos: 'adjective', pl: 'niematerialny, nieuchwytny', example: 'Brand reputation is an intangible asset.', tip: 'in-TEN-dżə-bəl' },
  { word: 'culprit', ipa: '/ˈkʌlprɪt/', pos: 'noun', pl: 'winowajca, sprawca; przyczyna problemu', example: 'The culprit was a stale cache.', tip: 'KAL-prit' },
  { word: 'prerequisite', ipa: '/priˈrekwəzɪt/', pos: 'noun', pl: 'warunek wstępny', example: 'Node 20 is a prerequisite for this project.', tip: 'pri-RE-kwə-zit; liczba mnoga „prerequisites” = …zits' },
  { word: 'triage', ipa: '/triˈɑːʒ/', pos: 'noun / verb', pl: 'segregacja, ustalanie priorytetów (zgłoszeń, pacjentów)', example: 'We triage new bugs every Monday.', tip: 'tri-AŻ (US) albo TRI-aż (UK), końcówka jak „ż”' },
  { word: 'harness', ipa: '/ˈhɑːrnəs/', pos: 'noun / verb', pl: 'uprząż; (IT) środowisko do uruchamiania testów/agentów; wykorzystać, okiełznać', example: 'The test harness runs every suite in isolation.', tip: 'HAR-nəs; „harnesses” = HAR-nə-siz' },
  { word: 'rebuttal', ipa: '/rɪˈbʌtəl/', pos: 'noun', pl: 'odparcie (zarzutu), kontrargument, replika', example: 'He wrote a long rebuttal to the review comments.', tip: 'ri-BA-təl, w US „tt” brzmi prawie jak „d”' },
  { word: 'chore', ipa: '/tʃɔːr/', pos: 'noun', pl: 'obowiązek (domowy), nudne zadanie; (git) zmiana porządkowa', example: 'Updating dependencies is a chore.', tip: 'CZOR, jedna sylaba' },
  { word: 'despicable', ipa: '/dɪˈspɪkəbəl/', pos: 'adjective', pl: 'podły, nikczemny, godny pogardy', example: 'Lying to customers is despicable.', tip: 'di-SPI-kə-bəl' },
  { word: 'benign', ipa: '/bɪˈnaɪn/', pos: 'adjective', pl: 'łagodny, nieszkodliwy', example: 'The warning is benign — you can ignore it.', tip: 'bi-NAJN, „g” nieme' },
  { word: 'plausible', ipa: '/ˈplɔːzəbəl/', pos: 'adjective', pl: 'prawdopodobny, wiarygodny, przekonujący', example: 'That’s a plausible explanation for the outage.', tip: 'PLO-zə-bəl, „s” brzmi jak „z”' },
  { word: 'obscure', ipa: '/əbˈskjʊr/', pos: 'adjective / verb', pl: 'mało znany, niejasny; zaciemniać, przesłaniać', example: 'It failed because of an obscure edge case.', tip: 'əb-SKJUR, akcent na drugą sylabę' },
  { word: 'tacit', ipa: '/ˈtæsɪt/', pos: 'adjective', pl: 'milczący, dorozumiany, niewypowiedziany', example: 'Much of the team’s knowledge is tacit.', tip: 'TE-sit, „c” jak „s”' },
  { word: 'feasible', ipa: '/ˈfiːzəbəl/', pos: 'adjective', pl: 'wykonalny, realny', example: 'Is it feasible to ship this by Friday?', tip: 'FI-zə-bəl, „s” jak „z”' },
]


// Surprise pool: words in the same spirit — workplace / engineering English,
// formal adjectives, and words whose pronunciation trips Polish speakers.
export const SURPRISE_WORDS: EnglishWord[] = [
  { word: 'mitigate', ipa: '/ˈmɪtɪɡeɪt/', pos: 'verb', pl: 'łagodzić, ograniczać (ryzyko, skutki)', example: 'We added rate limiting to mitigate abuse.', tip: 'MI-ti-gejt' },
  { word: 'exploit', ipa: '/ɪkˈsplɔɪt/ (v), /ˈeksplɔɪt/ (n)', pos: 'verb / noun', pl: 'wykorzystać (lukę); exploit — kod atakujący lukę', example: 'Attackers can exploit this bug remotely.', tip: 'czasownik: ik-SPLOJT, rzeczownik: EK-splojt' },
  { word: 'mandatory', ipa: '/ˈmændətɔːri/', pos: 'adjective', pl: 'obowiązkowy', example: 'Code review is mandatory for every PR.', tip: 'MEN-də-to-ri, akcent na pierwszą' },
  { word: 'deprecate', ipa: '/ˈdeprəkeɪt/', pos: 'verb', pl: 'oznaczyć jako przestarzałe (do usunięcia)', example: 'This method is deprecated since v14.', tip: 'DE-prə-kejt' },
  { word: 'ubiquitous', ipa: '/juːˈbɪkwɪtəs/', pos: 'adjective', pl: 'wszechobecny', example: 'Spreadsheets are ubiquitous in finance.', tip: 'ju-BI-kwi-təs' },
  { word: 'ambiguous', ipa: '/æmˈbɪɡjuəs/', pos: 'adjective', pl: 'niejednoznaczny', example: 'The requirements are ambiguous.', tip: 'em-BI-gju-əs' },
  { word: 'redundant', ipa: '/rɪˈdʌndənt/', pos: 'adjective', pl: 'zbędny, nadmiarowy; (UK) zwolniony z pracy', example: 'This check is redundant — remove it.', tip: 'ri-DAN-dənt' },
  { word: 'leverage', ipa: '/ˈlevərɪdʒ/', pos: 'verb / noun', pl: 'wykorzystać; dźwignia, przewaga', example: 'We can leverage the existing API.', tip: 'LE-və-ridż (US też LI-və-ridż)' },
  { word: 'bottleneck', ipa: '/ˈbɑːtəlnek/', pos: 'noun', pl: 'wąskie gardło', example: 'The database is the bottleneck.', tip: 'BA-təl-nek' },
  { word: 'thorough', ipa: '/ˈθɜːroʊ/', pos: 'adjective', pl: 'dokładny, gruntowny', example: 'Thanks for the thorough review.', tip: 'THE-rou — nie mylić z „through” (θruː)' },
  { word: 'cumbersome', ipa: '/ˈkʌmbərsəm/', pos: 'adjective', pl: 'nieporęczny, uciążliwy', example: 'The old deploy process was cumbersome.', tip: 'KAM-bər-səm' },
  { word: 'nuance', ipa: '/ˈnuːɑːns/', pos: 'noun', pl: 'niuans', example: 'There is a nuance in how caching works here.', tip: 'NU-ans' },
  { word: 'caveat', ipa: '/ˈkæviæt/', pos: 'noun', pl: 'zastrzeżenie, haczyk', example: 'One caveat: it only works in Chrome.', tip: 'KE-wi-et, trzy sylaby' },
  { word: 'consensus', ipa: '/kənˈsensəs/', pos: 'noun', pl: 'konsensus, zgoda', example: 'We reached consensus on the API design.', tip: 'kən-SEN-səs' },
  { word: 'scrutiny', ipa: '/ˈskruːtəni/', pos: 'noun', pl: 'wnikliwa kontrola, badanie', example: 'The change is under close scrutiny.', tip: 'SKRU-tə-ni' },
  { word: 'leeway', ipa: '/ˈliːweɪ/', pos: 'noun', pl: 'swoboda, margines', example: 'The deadline gives us some leeway.', tip: 'LI-łej' },
  { word: 'pivotal', ipa: '/ˈpɪvətəl/', pos: 'adjective', pl: 'kluczowy, przełomowy', example: 'This release is pivotal for the company.', tip: 'PI-wə-təl' },
  { word: 'gauge', ipa: '/ɡeɪdʒ/', pos: 'verb / noun', pl: 'oceniać, mierzyć; wskaźnik, miernik', example: 'Let’s gauge interest before we build it.', tip: 'GEJDŻ — „u” nieme' },
  { word: 'subtle', ipa: '/ˈsʌtəl/', pos: 'adjective', pl: 'subtelny', example: 'There’s a subtle bug in the date logic.', tip: 'SA-təl — „b” nieme' },
  { word: 'debt', ipa: '/det/', pos: 'noun', pl: 'dług', example: 'We need to pay down tech debt.', tip: 'DET — „b” nieme' },
  { word: 'queue', ipa: '/kjuː/', pos: 'noun / verb', pl: 'kolejka; ustawić w kolejce', example: 'The job is waiting in the queue.', tip: 'KJU — cztery ostatnie litery nieme' },
  { word: 'cache', ipa: '/kæʃ/', pos: 'noun', pl: 'pamięć podręczna', example: 'Clear the cache and try again.', tip: 'KESZ — jak „cash”, nie „kejsz”' },
  { word: 'suite', ipa: '/swiːt/', pos: 'noun', pl: 'zestaw (testów, programów); apartament', example: 'The whole test suite passes.', tip: 'SŁIT — jak „sweet”, nie „sjut”' },
  { word: 'height', ipa: '/haɪt/', pos: 'noun', pl: 'wysokość', example: 'Set the row height to 30 pixels.', tip: 'HAJT — kończy się na „t”, nie „th”' },
  { word: 'width', ipa: '/wɪdθ/', pos: 'noun', pl: 'szerokość', example: 'The column width is too small.', tip: 'ŁIDTH, końcowe „th” bezdźwięczne' },
  { word: 'archive', ipa: '/ˈɑːrkaɪv/', pos: 'noun / verb', pl: 'archiwum; archiwizować', example: 'Archive the old project.', tip: 'AR-kajw — „ch” jak „k”' },
  { word: 'hierarchy', ipa: '/ˈhaɪərɑːrki/', pos: 'noun', pl: 'hierarchia', example: 'Check the folder hierarchy.', tip: 'HAJ-ə-rar-ki' },
  { word: 'colleague', ipa: '/ˈkɑːliːɡ/', pos: 'noun', pl: 'kolega/koleżanka z pracy', example: 'A colleague reviewed my PR.', tip: 'KA-lig — dwie sylaby' },
  { word: 'schedule', ipa: '/ˈskedʒuːl/', pos: 'noun / verb', pl: 'harmonogram; zaplanować', example: 'Let’s schedule a call for Thursday.', tip: 'US: SKE-dżul, UK: SZE-djul' },
  { word: 'determine', ipa: '/dɪˈtɜːrmɪn/', pos: 'verb', pl: 'ustalić, określić', example: 'We need to determine the root cause.', tip: 'di-TER-min — nie „deter-majn”' },
  { word: 'genre', ipa: '/ˈʒɑːnrə/', pos: 'noun', pl: 'gatunek (filmu, muzyki)', example: 'What genre of music do you like?', tip: 'ŻAN-rə' },
  { word: 'entrepreneur', ipa: '/ˌɑːntrəprəˈnɜːr/', pos: 'noun', pl: 'przedsiębiorca', example: 'She’s a serial entrepreneur.', tip: 'an-trə-prə-NER, akcent na koniec' },
  { word: 'reluctant', ipa: '/rɪˈlʌktənt/', pos: 'adjective', pl: 'niechętny', example: 'The team was reluctant to change the stack.', tip: 'ri-LAK-tənt' },
  { word: 'eventually', ipa: '/ɪˈventʃuəli/', pos: 'adverb', pl: 'w końcu, ostatecznie (NIE „ewentualnie”!)', example: 'It eventually worked after a restart.', tip: 'fałszywy przyjaciel: „ewentualnie” = possibly' },
  { word: 'actually', ipa: '/ˈæktʃuəli/', pos: 'adverb', pl: 'właściwie, tak naprawdę (NIE „aktualnie”!)', example: 'Actually, the bug was in the backend.', tip: 'fałszywy przyjaciel: „aktualnie” = currently' },
  { word: 'sympathetic', ipa: '/ˌsɪmpəˈθetɪk/', pos: 'adjective', pl: 'współczujący, wyrozumiały (NIE „sympatyczny”)', example: 'The manager was sympathetic to the delay.', tip: '„sympatyczny” = nice, friendly' },
  { word: 'consequently', ipa: '/ˈkɑːnsəkwentli/', pos: 'adverb', pl: 'w rezultacie, w konsekwencji (NIE „konsekwentnie”)', example: 'The API changed; consequently, the app broke.', tip: '„konsekwentnie” = consistently' },
  { word: 'eligible', ipa: '/ˈelɪdʒəbəl/', pos: 'adjective', pl: 'uprawniony, spełniający warunki', example: 'You are eligible for a refund.', tip: 'E-li-dżə-bəl' },
  { word: 'meticulous', ipa: '/məˈtɪkjələs/', pos: 'adjective', pl: 'drobiazgowy, skrupulatny', example: 'She keeps meticulous notes.', tip: 'mə-TI-kju-ləs' },
  { word: 'arbitrary', ipa: '/ˈɑːrbətreri/', pos: 'adjective', pl: 'dowolny; arbitralny', example: 'The limit of 100 is arbitrary.', tip: 'AR-bə-tre-ri' },
  { word: 'idempotent', ipa: '/ˌaɪdəmˈpoʊtənt/', pos: 'adjective', pl: 'idempotentny (wielokrotne wywołanie = ten sam efekt)', example: 'The migration script must be idempotent.', tip: 'aj-dəm-POU-tənt' },
  { word: 'concise', ipa: '/kənˈsaɪs/', pos: 'adjective', pl: 'zwięzły', example: 'Keep the PR description concise.', tip: 'kən-SAJS' },
  { word: 'cohesive', ipa: '/koʊˈhiːsɪv/', pos: 'adjective', pl: 'spójny', example: 'The design feels cohesive.', tip: 'kou-HI-siw' },
  { word: 'tedious', ipa: '/ˈtiːdiəs/', pos: 'adjective', pl: 'żmudny, nużący (tedious)', example: 'Manual testing is tedious.', tip: 'TI-di-əs' },
  { word: 'ensure', ipa: '/ɪnˈʃʊr/', pos: 'verb', pl: 'zapewnić, upewnić się', example: 'Please ensure the tests pass.', tip: 'in-SZUR' },
  { word: 'inherent', ipa: '/ɪnˈhɪrənt/', pos: 'adjective', pl: 'nieodłączny, wrodzony', example: 'There are inherent risks in any migration.', tip: 'in-HI-rənt — bliskie „intrinsic”' },
  { word: 'circumvent', ipa: '/ˌsɜːrkəmˈvent/', pos: 'verb', pl: 'obejść (zasadę, zabezpieczenie)', example: 'Don’t circumvent the review process.', tip: 'SER-kəm-WENT' },
  { word: 'nefarious', ipa: '/nɪˈferiəs/', pos: 'adjective', pl: 'niegodziwy, nikczemny', example: 'The script was used for nefarious purposes.', tip: 'ni-FE-ri-əs — bliskie „despicable”' },
  { word: 'innocuous', ipa: '/ɪˈnɑːkjuəs/', pos: 'adjective', pl: 'nieszkodliwy, niewinny', example: 'It looked like an innocuous change.', tip: 'i-NA-kju-əs — bliskie „benign”' },
  { word: 'viable', ipa: '/ˈvaɪəbəl/', pos: 'adjective', pl: 'realny, opłacalny, mający szanse', example: 'Is this a viable business model?', tip: 'WAJ-ə-bəl — bliskie „feasible”' },
  { word: 'implicit', ipa: '/ɪmˈplɪsɪt/', pos: 'adjective', pl: 'domyślny, ukryty, dorozumiany', example: 'There’s an implicit dependency on the clock.', tip: 'im-PLI-sit — bliskie „tacit”' },
  { word: 'esoteric', ipa: '/ˌesəˈterɪk/', pos: 'adjective', pl: 'hermetyczny, zrozumiały dla nielicznych', example: 'That’s an esoteric corner of the spec.', tip: 'e-sə-TE-rik — bliskie „obscure”' },
  { word: 'counterargument', ipa: '/ˈkaʊntərɑːrɡjəmənt/', pos: 'noun', pl: 'kontrargument', example: 'Do you have a counterargument?', tip: 'KAUN-tər-ar-gju-mənt — bliskie „rebuttal”' },
  { word: 'precondition', ipa: '/ˌpriːkənˈdɪʃən/', pos: 'noun', pl: 'warunek wstępny', example: 'A signed contract is a precondition.', tip: 'pri-kən-DI-szən — bliskie „prerequisite”' },
  { word: 'scapegoat', ipa: '/ˈskeɪpɡoʊt/', pos: 'noun', pl: 'kozioł ofiarny', example: 'Don’t make the intern the scapegoat.', tip: 'SKEJP-gout — bliskie „culprit”' },
  { word: 'breach', ipa: '/briːtʃ/', pos: 'noun / verb', pl: 'naruszenie, wyciek; naruszyć', example: 'The data breach exposed emails.', tip: 'BRICZ — bliskie „violate”' },
  { word: 'endeavor', ipa: '/ɪnˈdevər/', pos: 'noun / verb', pl: 'przedsięwzięcie, starania', example: 'Good luck with your new endeavor.', tip: 'in-DE-wər' },
]

export const ENGLISH_WORDS: EnglishWord[] = [
  ...MY_WORDS.map((w) => ({ ...w, own: true })),
  ...SURPRISE_WORDS.map((w) => ({ ...w, own: false })),
]
