// Jednolite drzewo kategorii (PL). group -> używane w raportach zbiorczych.
export type Category = { id: string; name: string; group: string; nature: string }

export const CATEGORIES: Category[] = [
  // --- przepływy niebędące konsumpcją ---
  { id: 'transfer_wlasny',     name: 'Przelew własny',            group: 'Transfery',   nature: 'transfer' },
  { id: 'transfer_gospod',     name: 'Transfer do gospodarstwa',  group: 'Transfery',   nature: 'fixed'    },
  { id: 'zwrot_gospod',        name: 'Zwrot z gospodarstwa / ING', group: 'Transfery',  nature: 'income'   },
  { id: 'oszczednosci',        name: 'Oszczędności / inwestycje', group: 'Transfery',   nature: 'saving'   },
  { id: 'przychod_firmowy',    name: 'Przychód firmowy',          group: 'Przychody',   nature: 'income'   },
  { id: 'przychod_inny',       name: 'Inne wpływy',               group: 'Przychody',   nature: 'income'   },
  { id: 'zwrot',               name: 'Zwroty',                    group: 'Przychody',   nature: 'income'   },
  // --- podatki i firma ---
  { id: 'podatek_vat',         name: 'VAT',                       group: 'Podatki',     nature: 'tax' },
  { id: 'podatek_pit',         name: 'PIT-28 (ryczałt)',          group: 'Podatki',     nature: 'tax' },
  { id: 'zus',                 name: 'ZUS',                       group: 'Podatki',     nature: 'tax' },
  { id: 'ksiegowosc',          name: 'Księgowość i doradztwo',    group: 'Firma',       nature: 'fixed' },
  { id: 'uslugi_firmowe',      name: 'Usługi i narzędzia firmowe',group: 'Firma',       nature: 'variable' },
  { id: 'refaktura',           name: 'Refaktury (odzyskiwane)',   group: 'Firma',       nature: 'passthrough' },
  { id: 'oplaty_bankowe',      name: 'Opłaty bankowe',            group: 'Firma',       nature: 'fixed' },
  // --- dom ---
  { id: 'dom_media',           name: 'Media i rachunki',          group: 'Dom',         nature: 'fixed' },
  { id: 'dom_remont',          name: 'Remont, ogród, dom',        group: 'Dom',         nature: 'variable' },
  { id: 'dom_wyposazenie',     name: 'Wyposażenie i AGD',         group: 'Dom',         nature: 'variable' },
  { id: 'dom_uslugi',          name: 'Usługi domowe (sprzątanie)',group: 'Dom',         nature: 'fixed' },
  // --- życie codzienne ---
  { id: 'zywnosc',             name: 'Żywność i chemia',          group: 'Codzienne',   nature: 'variable' },
  { id: 'jedzenie_poza',       name: 'Jedzenie poza domem',       group: 'Codzienne',   nature: 'discretionary' },
  { id: 'alkohol',             name: 'Alkohol',                   group: 'Codzienne',   nature: 'discretionary' },
  { id: 'gotowka',             name: 'Wypłaty gotówki',           group: 'Codzienne',   nature: 'variable' },
  // --- transport ---
  { id: 'paliwo',              name: 'Paliwo',                    group: 'Transport',   nature: 'variable' },
  { id: 'auto_serwis',         name: 'Serwis, myjnia, przeglądy', group: 'Transport',   nature: 'variable' },
  { id: 'auto_ubezpieczenie',  name: 'Ubezpieczenie auta',        group: 'Transport',   nature: 'fixed' },
  { id: 'parking',             name: 'Parkingi i opłaty drogowe', group: 'Transport',   nature: 'variable' },
  { id: 'przejazdy',           name: 'Taxi i komunikacja',        group: 'Transport',   nature: 'variable' },
  // --- podróże ---
  { id: 'podroz_loty',         name: 'Loty',                      group: 'Podróże',     nature: 'discretionary' },
  { id: 'podroz_nocleg',       name: 'Noclegi',                   group: 'Podróże',     nature: 'discretionary' },
  { id: 'podroz_atrakcje',     name: 'Atrakcje i bilety',         group: 'Podróże',     nature: 'discretionary' },
  { id: 'podroz_inne',         name: 'Podróże — inne',            group: 'Podróże',     nature: 'discretionary' },
  // --- zdrowie ---
  { id: 'zdrowie_opieka',      name: 'Lekarze i terapia',         group: 'Zdrowie',     nature: 'fixed' },
  { id: 'zdrowie_leki',        name: 'Apteka i leki',             group: 'Zdrowie',     nature: 'variable' },
  { id: 'uroda',               name: 'Uroda i kosmetyki',         group: 'Zdrowie',     nature: 'discretionary' },
  // --- styl życia ---
  { id: 'sport',               name: 'Sport i aktywność',         group: 'Styl życia',  nature: 'discretionary' },
  { id: 'rozrywka',            name: 'Wyjścia i wydarzenia',      group: 'Styl życia',  nature: 'discretionary' },
  { id: 'hobby',               name: 'Hobby',                     group: 'Styl życia',  nature: 'discretionary' },
  { id: 'kultura',             name: 'Kultura i muzea',           group: 'Styl życia',  nature: 'discretionary' },
  { id: 'ubrania',             name: 'Ubrania i obuwie',          group: 'Styl życia',  nature: 'discretionary' },
  { id: 'elektronika',         name: 'Elektronika',               group: 'Styl życia',  nature: 'discretionary' },
  { id: 'ksiazki',             name: 'Książki, prasa, multimedia', group: 'Styl życia', nature: 'discretionary' },
  { id: 'edukacja',            name: 'Kursy i edukacja',          group: 'Styl życia',  nature: 'variable' },
  { id: 'prezenty',            name: 'Prezenty i wsparcie',       group: 'Styl życia',  nature: 'discretionary' },
  { id: 'darowizny',           name: 'Darowizny i cele charytatywne', group: 'Styl życia', nature: 'fixed' },
  { id: 'p2p',                 name: 'Przelewy do osób (BLIK P2P)', group: 'Inne',        nature: 'variable' },
  // --- rodzina ---
  { id: 'dzieci_przedszkole',  name: 'Przedszkole i szkoła',      group: 'Dzieci',      nature: 'fixed' },
  { id: 'dzieci_zajecia',      name: 'Zajęcia dodatkowe',         group: 'Dzieci',      nature: 'fixed' },
  { id: 'dzieci_inne',         name: 'Dzieci — inne',             group: 'Dzieci',      nature: 'variable' },
  { id: 'zwierzeta',           name: 'Zwierzęta',                 group: 'Dzieci',      nature: 'variable' },
  // --- abonamenty i ubezpieczenia ---
  { id: 'telekom',             name: 'Telefon, internet, TV',     group: 'Abonamenty',  nature: 'fixed' },
  { id: 'subskrypcje',         name: 'Subskrypcje cyfrowe',       group: 'Abonamenty',  nature: 'fixed' },
  { id: 'ubezpieczenia',       name: 'Ubezpieczenia',             group: 'Abonamenty',  nature: 'fixed' },
  // --- reszta ---
  { id: 'mandaty',             name: 'Mandaty i opłaty urzędowe', group: 'Inne',        nature: 'variable' },
  { id: 'zakupy_online',       name: 'Zakupy online (nieokreślone)', group: 'Inne',     nature: 'variable' },
  { id: 'inne',                name: 'Inne',                      group: 'Inne',        nature: 'variable' },
  { id: 'do_sklasyfikowania',  name: 'Do sklasyfikowania',        group: 'Inne',        nature: 'unknown' },
];

export const CATEGORY_BY_ID: Record<string, Category> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
