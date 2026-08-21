import { CATEGORIES } from './categories'

/** Konta docelowe, do których można przypisać kategorię. */
// Cele to ROLE, nie konkretne rachunki — użytkownik mapuje role na swoje konta
// w ustawieniach modułu, więc struktura działa niezależnie od banku.
export type Target = { id: string; name: string }

export const TARGETS: Target[] = [
  { id: 'daily',     name: 'Konto codzienne' },
  { id: 'hub',       name: 'Konto główne — większe i stałe' },
  { id: 'business',  name: 'Konto firmowe — koszty działalności' },
  { id: 'tax',       name: 'Subkonto — podatki i rezerwy' },
  { id: 'household', name: 'Gospodarstwo domowe' },
  { id: 'savings',   name: 'Oszczędności (wyjazdy, cele)' },
  { id: 'skip',      name: 'Pomiń w planie' },
]

/** Domyślna struktura — punkt wyjścia do ręcznej korekty. */
const DEFAULTS: Record<string, string> = {
  // mBank: codzienne, drobne, częste
  zywnosc: 'daily', jedzenie_poza: 'daily', alkohol: 'daily',
  przejazdy: 'daily', parking: 'daily', paliwo: 'daily',
  rozrywka: 'daily', kultura: 'daily', sport: 'daily',
  hobby: 'daily', uroda: 'daily', ksiazki: 'daily',
  gotowka: 'daily', zwierzeta: 'daily', subskrypcje: 'daily',
  zakupy_online: 'daily', p2p: 'daily', prezenty: 'daily',
  // Przedszkole i sprawy dzieci to wydatki powtarzalne — konto codzienne.
  dzieci_przedszkole: 'daily', dzieci_zajecia: 'daily', dzieci_inne: 'daily',
  zdrowie_leki: 'daily',

  // PKO prywatne: większe, planowane, stałe zobowiązania
  zdrowie_opieka: 'hub',
  ubrania: 'hub', elektronika: 'hub', edukacja: 'hub',
  dom_remont: 'hub', dom_wyposazenie: 'hub', dom_media: 'hub',
  dom_uslugi: 'hub', ubezpieczenia: 'hub',
  // Rachunki stałe i przewidywalne trzymamy razem z podatkami.
  telekom: 'tax',
  auto_serwis: 'hub', auto_ubezpieczenie: 'hub',
  darowizny: 'hub', mandaty: 'hub', inne: 'hub',
  do_sklasyfikowania: 'hub',

  // Firma
  uslugi_firmowe: 'business', ksiegowosc: 'business',
  oplaty_bankowe: 'business', refaktura: 'business',

  // Subkonto
  podatek_vat: 'tax', podatek_pit: 'tax', zus: 'tax',

  // Gospodarstwo i oszczędności
  transfer_gospod: 'household', zwrot_gospod: 'skip',
  podroz_loty: 'savings', podroz_nocleg: 'savings',
  podroz_atrakcje: 'savings', podroz_inne: 'savings',

  transfer_wlasny: 'skip', przychod_firmowy: 'skip',
  przychod_inny: 'skip', zwrot: 'skip', oszczednosci: 'skip',
};

export const DEFAULT_TARGETS: Record<string, string> = DEFAULTS

export function defaultTargetFor(categoryId: string): string {
  return DEFAULTS[categoryId] || 'hub'
}
