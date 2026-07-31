import pl from '../i18n/pl'

interface Section {
  icon: string
  title: string
  points: string[]
}

const SECTIONS: Section[] = [
  {
    icon: '📲', title: 'Instalacja i powiadomienia',
    points: [
      'Zainstaluj jako aplikację: na telefonie użyj przycisku „Zainstaluj aplikację" (albo w przeglądarce „Dodaj do ekranu głównego"). Krzyżyk ✕ chowa przycisk do następnego odświeżenia.',
      'Powiadomienia push włącz w Ustawieniach → „Włącz powiadomienia". Jeśli nie przychodzą na telefon: w ustawieniach systemu zezwól aplikacji na powiadomienia i wyłącz optymalizację baterii dla niej.',
      'Dostęp chroni PIN — ustawiasz go przy pierwszym wejściu, potem podajesz na każdym urządzeniu.',
    ],
  },
  {
    icon: '🏠', title: 'Dziś',
    points: [
      'Widzisz zaplanowane na dziś posiłki i sumę makroskładników.',
      'Oznaczaj posiłki jako „Zjedzone", żeby liczyły się do dziennika.',
      '„Dodaj jedzenie lub produkt" — wpisz własne jedzenie (makro oszacuje AI) albo dodaj gotowy produkt z bazy.',
    ],
  },
  {
    icon: '📖', title: 'Przepisy',
    points: [
      'Przeglądaj, szukaj i filtruj po kategoriach; wejdź w przepis po składniki, kroki i makro.',
      'Dodawaj własne przepisy lub przeliczaj makro dla istniejących.',
      'Import z JSON: przycisk importu wkleja wiele przepisów naraz (duplikaty nazw dostają unikalny adres).',
    ],
  },
  {
    icon: '📅', title: 'Plan posiłków',
    points: [
      'Planuj tydzień: przypisuj przepisy do dni i posiłków, ustawiaj liczbę porcji.',
      '„Drukuj tydzień" tworzy wydruk: przegląd tygodnia, lista zakupów z checkboxami (3 kolumny) oraz przepisy na każdy dzień (składniki | przygotowanie).',
      'Z planu generujesz listę zakupów (zakładka Zakupy).',
    ],
  },
  {
    icon: '🛒', title: 'Zakupy',
    points: [
      '„Generuj z planu" tworzy listę z przepisów w wybranym zakresie dat (bez duplikatów, z pominięciem rzeczy ze Spiżarni).',
      'Odhaczaj kupione produkty; usuwaj lub dodawaj własne pozycje.',
      'Frisco: „Napełnij koszyk Frisco" (serwer) albo prompt/skrypt. Checkbox 🛒 przy produkcie dodaje/usuwa go z koszyka Frisco, a ikonka linkuje do produktu.',
      '„Mam w domu" przenosi produkt do Spiżarni i usuwa go z listy oraz z koszyka Frisco.',
    ],
  },
  {
    icon: '🥫', title: 'Spiżarnia',
    points: [
      'Trzymaj tu rzeczy, które masz w domu — nie będą dodawane do generowanych list zakupów.',
      'Gdy coś się skończy, usuń to ze Spiżarni, a wróci na zakupy.',
    ],
  },
  {
    icon: '📊', title: 'Dziennik',
    points: [
      'Podgląd spożytych kalorii i makro dzień po dniu, z celami i wykresami tygodnia.',
      'Strzałkami przełączasz dni i tygodnie.',
    ],
  },
  {
    icon: '💊', title: 'Suplementy',
    points: [
      'Dodaj suplement lub lek z harmonogramem (godziny + dni).',
      'Klikaj „Przyjmij", gdy weźmiesz dawkę.',
      'Przypomnienie push powtarza się co ~30 min od ustawionej godziny, aż klikniesz „Przyjmij". Ikonka 🔔 wysyła testowe powiadomienie od razu.',
    ],
  },
  {
    icon: '🔔', title: 'Przypomnienia',
    points: [
      'Własne przypomnienia (woda, gotowanie, dowolne) o wybranej godzinie i w wybrane dni — wysyłane jako push.',
    ],
  },
  {
    icon: '✅', title: 'Zadania',
    points: [
      'Lista zadań z priorytetami (Wysoki / Średni / Niski), pogrupowana po priorytecie.',
      'Kliknij treść lub ✏️, by edytować; strzałkami ▲/▼ sortujesz ręcznie; checkbox oznacza zrobione.',
    ],
  },
  {
    icon: '💡', title: 'Pomysły',
    points: [
      'Jak zadania, ale bez priorytetów — z tytułem i opisem. Edycja i ręczne sortowanie tak samo.',
    ],
  },
  {
    icon: '🔁', title: 'Nawyki',
    points: [
      'Dodaj nawyk (np. „dzień bez facebooka").',
      'Raz dziennie o losowej porze push zapyta „czy dziś się udało?"; odpowiadasz ✅/❌.',
      'Treść pokazuje serię — np. „już 5 dni 🔥". Pominięty dzień zrywa serię (dzisiejszy brak odpowiedzi jeszcze nie).',
    ],
  },
  {
    icon: '🎙️', title: 'Notatki głosowe',
    points: [
      'Nagraj notatkę — transkrypcja powstaje na żywo (natywne rozpoznawanie mowy na telefonie/Macu).',
      'Tekst możesz poprawić ręcznie, a dla nagrań bez transkrypcji użyć „Transkrybuj z nagrania" (serwerowo).',
    ],
  },
  {
    icon: '⚙️', title: 'Ustawienia',
    points: [
      'Cele dzienne (kcal, białko, woda), strefa czasowa, powiadomienia, baza gotowych produktów.',
      'Widoczność modułów: możesz ukryć w nawigacji Plan / Zakupy / Dziennik / Suplementy, jeśli ich nie używasz.',
    ],
  },
]

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">❓ {pl.nav.help}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">{pl.help.intro}</p>

      <div className="space-y-2">
        {SECTIONS.map((s) => (
          <details key={s.title} className="group rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <span aria-hidden="true">{s.icon}</span>
              <span className="flex-1">{s.title}</span>
              <span className="text-gray-400 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            </summary>
            <ul className="space-y-1.5 border-t border-gray-100 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary-400" aria-hidden="true">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <p className="pt-2 text-center text-xs text-gray-400">{pl.help.footer}</p>
    </div>
  )
}
