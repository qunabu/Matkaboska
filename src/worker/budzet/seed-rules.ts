// Generyczne reguły kategoryzacji — sieci handlowe, banki, urzędy, przewoźnicy.
// Działają dla każdego użytkownika. Reguły zawierające dane osobowe (nazwiska,
// numery rachunków, nazwy kontrahentów) NIE są tu trzymane — powstają per konto
// z ustawień użytkownika (patrz personalRules() w rules.ts).
// pattern  – dopasowywany (case-insensitive) do: nadawca + adres + tytuł + opis
// business – true = koszt firmowy, false = konsumpcja prywatna, null = zależnie od konta
// prio     – wyższy wygrywa
export type SeedRule = {
  pattern: string; category: string; label: string | null
  business: boolean | null; prio: number; sign: '+' | '-' | null
}

const R = (
  pattern: string, category: string, label: string | null = null,
  business: boolean | null = null, prio = 100, sign: '+' | '-' | null = null,
): SeedRule => ({ pattern, category, label, business, prio, sign })

export const SEED_RULES: SeedRule[] = [
  // ---------- gospodarstwo domowe (przed regułą nazwiska właściciela!) ----------

  // ---------- przelewy własne (najwyższy priorytet: nazwa właściciela) ----------
  // Wpływy/wypłaty pomiędzy własnymi rachunkami — także z konta ING, którego nie eksportujemy.

  // ---------- wpływy (rozstrzygane znakiem kwoty) ----------
  R('Faktura|FV |/NIP/', 'przychod_firmowy', 'Faktura sprzedaży', true, 930, '+'),
  R('ZWROT|REFUND|Zwrot', 'zwrot', null, null, 920, '+'),
  R('ODSETKI|KAPITALIZACJA', 'przychod_inny', 'Odsetki', null, 910, '+'),

  // ---------- podatki / ZUS (najwyższy priorytet) ----------
  R('URZ[ĄA]D SKARBOWY.*VAT', 'podatek_vat', 'Urząd Skarbowy — VAT', true, 900),
  R('URZ[ĄA]D SKARBOWY.*PIT', 'podatek_pit', 'Urząd Skarbowy — PIT-28', true, 900),
  R('URZ[ĄA]D SKARBOWY', 'podatek_pit', 'Urząd Skarbowy', true, 890),
  R('^ZUS|ZUS/KRUS|Sk[łl]adka', 'zus', 'ZUS', true, 890),

  // ---------- firma ----------
  // Koszty przenoszone dalej na klienta — wracają w fakturze sprzedaży.
  R('Op[łl]ata za rachunek|PROWIZJ|Op[łl]aty bankowe|Op[łl]ata miesi', 'oplaty_bankowe', 'Opłaty bankowe', null, 770),
  R('ALLIANZ', 'ubezpieczenia', 'TU Allianz Życie', true, 770),

  // ---------- transfery ----------
  
  // Banki opisują spłatę karty na kilka sposobów; każdy z nich to przelew
  // między własnymi rachunkami, nie przychód ani wydatek.
  R('SP[ŁL]ATA KARTY|SP[ŁL]ATA AUTOMATYCZNA|AUTOMATYCZNA SP[ŁL]ATA|R[ĘE]CZNA SP[ŁL]ATA|SP[ŁL]ATA[^|]*DZI[ĘE]KUJEMY|SP[ŁL]ATA - PRZELEW WEWN', 'transfer_wlasny', 'Spłata karty kredytowej', null, 850),

  // ---------- dzieci ----------
  R('Przedszkole', 'dzieci_przedszkole', 'Przedszkole', false, 700),
  // Prawo jazdy: szkoła jazdy + aplikacja do rezerwacji terminów egzaminu.
  R('ARCHE FABRYKA SAMOLOTO|SMYK|ZABAWK', 'dzieci_inne', null, false, 690),

  // ---------- telekom / subskrypcje ----------
  R('OrangeOn-line|ORANGE|MOJEUSLUGI.PLAY|T-MOBILE|PLUS ?GSM|VECTRA|UPC|NETIA', 'telekom', 'Telekom', null, 700),
  R('NETFLIX|SPOTIFY|APPLE.COM/BILL|ITUNES|GOOGLE ?\\*|OPENAI|ANTHROPIC|CLAUDE|GITHUB|ADOBE|DROPBOX|ICLOUD|YOUTUBEPREMIUM|DISNEY', 'subskrypcje', null, null, 700),
  R('EMULTISPORT|MULTISPORT|MEDICOVER SPORT', 'sport', 'Multisport', false, 700),

  // ---------- zdrowie ----------
  R('APTEKA|GEMINI|DOZ\\.PL|ZIKO', 'zdrowie_leki', null, false, 690),
  R('ROSSMANN|HEBE|SEPHORA|DOUGLAS|SAMUI SPA|FRYZJER|BARBER', 'uroda', null, false, 660),

  // ---------- transport ----------
  R('ORLEN|BP-|BP MORENA|SHELL|CIRCLE ?K|LOTOS|MOYA|AMIC|STACJA PALIW', 'paliwo', null, null, 680),
  R('STACJA DIAGNOSTYCZNA|MYJNIA|SERWIS OPON|WULKANIZ|AUTO ?SERWIS|PRZEGL[ĄA]D', 'auto_serwis', null, null, 670),
  R('PZU|POWSZECHNY ZAKLAD UBEZP|LINK4|WARTA|HESTIA', 'auto_ubezpieczenie', null, false, 670),
  R('PARKING|PARKOMAT|MPAY|SKYCASH|AUTOPAY.*A4|VIATOLL|E-TOLL|OLIVIA BUSINESS CENTRE', 'parking', null, null, 660),
  R('UBER|BOLT|FREENOW|TAXI|MPK|ZTM|PKP|INTERCITY|BILKOM|KOLEJE|FLIXBUS|MEVO|\\bSKM\\b', 'przejazdy', null, null, 660),

  // ---------- podróże ----------
  R('RYANAIR|WIZZ ?AIR|LOT\\.COM|POLSKIE LINIE|LUFTHANSA|AIRASIA|EMIRATES|QATAR|KLM|EASYJET|VUELING|TURKISH', 'podroz_loty', null, false, 680),
  R('BOOKING\\.COM|AGODA|AIRBNB|HOTEL|HOSTEL|TRIVAGO|EXPEDIA|LUBICZ|RESORT', 'podroz_nocleg', null, false, 670),
  R('TIX\\.NL|GETYOURGUIDE|KLOOK|VIATOR|MUZEUM|TICKET', 'podroz_atrakcje', null, false, 660),
  R('VALUE PLUS CAR RENT|RENTALCARS|SIXT|EUROPCAR|HERTZ', 'podroz_inne', null, false, 660),

  // ---------- żywność ----------
  R('BIEDRONKA|JMP S\\.A|LIDL|KAUFLAND|CARREFOUR|AUCHAN|NETTO|DINO|STOKROTKA|POLOMARKET|ALDI|SELGROS|MAKRO', 'zywnosc', null, false, 650),
  R('[ŻZ]ABKA|ZABKA|FRESHMARKET|CARREFOUR EXPRESS|KAMI PARTYZANTOW|SPO[ŁL]EM', 'zywnosc', null, false, 640),
  R('ALKOHOL|MONOPOLOWY|WINO|BROWAR', 'alkohol', null, false, 640),

  // ---------- jedzenie poza domem ----------
  R('PYSZNE\\.PL|UBER ?EATS|GLOVO|WOLT|BOLT ?FOOD|OBIADO', 'jedzenie_poza', null, null, 650),

  // ---------- styl życia ----------
  R('OLIWA SQUASH|DECATHLON|SPORT|SI[ŁL]OWNIA|FITNESS|BASEN|JOGA|CROSSFIT|100CZNIA|PADEL', 'sport', null, false, 620),
  // Squash: przelewy do GAVY (także „na telefon”, gdzie nazwa nie występuje) oraz liga/korty.
  // Trener personalny / siłownia — płatne pakietami, tytuł przelewu „zwrot” myli.
  R('EMPIK|LEGIMI|AUDIOTEKA|STORYTEL|KSI[ĘE]GARNI', 'ksiazki', null, false, 620),
  R('KWIACIARNIA|PROJEKT KWIATY|\\bKWIATY\\b|FLORIST', 'prezenty', 'Kwiaciarnia', false, 640),
  R('EOBUWIE|ZALANDO|KAPPAHL|H&M|RESERVED|ZARA|CCC|SINSAY|MOHITO|MEDICINE|4F', 'ubrania', null, false, 620),
  R('MEDIA ?EXPERT|RTV ?EURO|X-KOM|MORELE|KOMPUTRONIK|APPLE STORE|IKEA', 'elektronika', null, false, 610),
  R('MARKET OBI|CASTORAMA|LEROY|GDANSKIE SKLADY DRZEWN|ESSAV-SKLAD DREWNA|BRICOMAN|PSB|SKLAD BUDOWLANY', 'dom_remont', null, false, 610),
  R('SKLEP ZOOLOGICZNY|ZOO ?KARINA|MAXI ?ZOO|WETERYNAR', 'zwierzeta', null, false, 610),
  R('KINO|TEATR|FILHARMONI|KLUB|PUB|CONCERT|KONCERT|MULTIKINO|CINEMA|GAK\\b', 'rozrywka', null, false, 600),

  // ---------- gotówka / online ----------
  R('WYP[ŁL]ATA|BANKOMAT|ATM KRAJOWY|Wyp[łl]ata got[óo]wki', 'gotowka', 'Wypłata gotówki', null, 600),
  R('ALLEGRO|AMAZON|ALIEXPRESS|ALIPAY|TEMU|SHEIN|OLX|VINTED', 'zakupy_online', null, false, 550),

  // ---------- fala 2: dopasowania z realnych danych ----------
  R('FUNDACJA WWF|UNICEF|WOŚP|WIELKA ORKIESTRA|CARITAS|PAH |PAJACYK|DAROWIZNA|PATRONITE|SIEPOMAGA', 'darowizny', null, false, 720),
  // Domyślnie subskrypcja; jeśli refakturujesz ją na klienta, nadpisz regułą własną.
  R('MEETUP', 'subskrypcje', 'Meetup', null, 700),
  R('AIR ?ASIA|AIRASIA|Air Asia', 'podroz_loty', 'AirAsia', false, 680),
  R('12GO|GRABTAXI|\\bGrab\\b|BOLT\\.EU', 'przejazdy', null, false, 660),
  R('KOHTAO|NOVOTEL|IBIS|MERCURE|MARRIOTT|HILTON|RADISSON|GUESTHOUSE|VILLA ', 'podroz_nocleg', null, false, 670),
  R('FARMACJA|PHARMACY', 'zdrowie_leki', null, false, 680),
  R('MARKS&SPENCER|MARKS AND SPENCER|PRIMARK|UNIQLO', 'ubrania', null, false, 620),
  R('OBCI[ĄA][ŻZ]\\. NATYCH|TRANSAKCJA WALUT|PRZEWALUTOWANIE|OP[ŁL]ATA MIES', 'oplaty_bankowe', 'Opłaty i przewalutowania', null, 690),
  // Bramki płatnicze — niski priorytet, żeby konkretne reguły (Przedszkole, Orange) wygrały.
  R('KRAJOWY INTEGRATOR P[ŁL]ATNO|\\bKIP\\b|PAYPRO|PRZELEWY24|P24-|PAYU|AUTOPAY|PAYNOW|TRANSFERUJ|ING PAY|TPAY|BLUE ?MEDIA|DOTPAY', 'zakupy_online', null, null, 300),
  R('OP[ŁL]ATA ZA MKONTO|OP[ŁL]ATA ZA KART|OP[ŁL]ATA ZA PROWADZENIE', 'oplaty_bankowe', 'Opłaty za konto', null, 690),
  R('TK ?MAXX|TEDI|PEPCO|ACTION ', 'ubrania', null, false, 610),
  // Nowe Ogrody 8/12 = adres Urzędu Miejskiego w Gdańsku (mandaty, opłaty).
  R('AIRALO|HOLAFLY|ORANGE FLEX|HEYAH|NJU ?MOBILE', 'telekom', null, false, 700),
  R('GOG\\.COM|GOGCOM|STEAM|STEAMGAMES|PLAYSTATION|NINTENDO|XBOX|EPIC ?GAMES|INSTANT-GAMING', 'hobby', null, false, 620),
  // Przelewy do osób prywatnych (BLIK P2P / na telefon) — do przejrzenia w kolejce.
  R('BLIK P2P-WYCHODZ|Przelew na telefon', 'p2p', null, false, 280),

  // ---------- przywrócone reguły generyczne (bez elementów osobistych) ----------
  R('MCDONALD|KFC|BURGER KING|SUBWAY|PIZZA|SUSHI|RAMEN|BISTRO|RESTAURACJA|KAWIARNIA|CAFE|COSTA|STARBUCKS|GREEN CAFFE|TAVERN|TRATTORIA|OSTERIA', 'jedzenie_poza', null, false, 630),
  R('CENTRUM PSYCHOLOGICZNE|PSYCHOLOG|PSYCHIATR|DERMATOLOG|MEDICOVER|LUX ?MED|ENEL-MED|CENTRUM MEDYCZNE|PRZYCHODNIA|STOMATOLOG|DENTYST|GINEKOLOG|OKULIST|PUNKT POBRA[ŃN]|SYNEVO|SYNVEO|DIAGNOSTYKA|ALAB|LABORATORIUM', 'zdrowie_opieka', null, false, 690),
  R('MUZEUM|MUSEUM|GALERIA SZTUKI|SKANSEN|PLANETARIUM|FILHARMONI', 'kultura', null, false, 720),
  R('EUROPARK|APCOA|CITY ?PARKING|GARA[ŻZ]|CAR PARK', 'parking', null, false, 660),
  R('URZ[ĄA]D ?MIEJSKI|URZADMIEJSKI|URZ[ĄA]D ?MIASTA|MANDAT', 'mandaty', null, false, 665),
  R('SZKO[ŁL]A JAZDY|\\bOSK\\b|\\bWORD\\b|KURS |SZKOLENIE', 'edukacja', null, false, 700),
];
