const pl = {
  // Navigation
  nav: {
    today: 'Dziś',
    recipes: 'Przepisy',
    plan: 'Plan',
    shopping: 'Zakupy',
    tracking: 'Dziennik',
    supplements: 'Suplementy',
    settings: 'Ustawienia',
  },

  // PWA update
  update: {
    available: 'Dostępna nowa wersja aplikacji',
    refresh: 'Odśwież',
    dismiss: 'Później',
    required: 'Wymagana aktualizacja',
    requiredBody: 'Ta wersja aplikacji jest nieaktualna. Zaktualizuj, aby kontynuować.',
    updating: 'Aktualizowanie…',
  },

  // Common
  common: {
    loading: 'Ładowanie…',
    error: 'Wystąpił błąd',
    retry: 'Spróbuj ponownie',
    save: 'Zapisz',
    cancel: 'Anuluj',
    delete: 'Usuń',
    edit: 'Edytuj',
    add: 'Dodaj',
    close: 'Zamknij',
    confirm: 'Potwierdź',
    back: 'Wstecz',
    search: 'Szukaj',
    filter: 'Filtruj',
    noResults: 'Brak wyników',
    appVersion: 'Wersja',
  },

  // Settings
  settings: {
    title: 'Ustawienia',
    about: 'O aplikacji',
    targets: 'Cele dzienne',
    kcal: 'Kalorie (kcal)',
    protein: 'Białko (g)',
    water: 'Woda (szklanek)',
    timezone: 'Strefa czasowa',
    notifications: 'Powiadomienia',
    enableNotifications: 'Włącz powiadomienia',
  },

  // Today
  today: {
    title: 'Dziś',
    breakfast: 'Śniadanie',
    lunch: 'Obiad',
    dinner: 'Kolacja',
    snack: 'Przekąska',
    noMeals: 'Brak zaplanowanych posiłków',
    markEaten: 'Zjedzone',
    batch: 'Gotowane dziś',
    leftover: 'Resztki',
  },
} as const

export type TranslationKey = typeof pl
export default pl
