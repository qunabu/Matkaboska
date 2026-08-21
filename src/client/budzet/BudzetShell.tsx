import { useEffect, useState, lazy, Suspense } from 'react'
import { get } from './api'
import './budzet.css'

const Pulpit = lazy(() => import('./pages/Pulpit'))
const PlanWyplaty = lazy(() => import('./pages/PlanWyplaty'))
const Struktura = lazy(() => import('./pages/Struktura'))
const Kategorie = lazy(() => import('./pages/Kategorie'))
const Sprzedawcy = lazy(() => import('./pages/Sprzedawcy'))
const Cykliczne = lazy(() => import('./pages/Cykliczne'))
const Wyjazdy = lazy(() => import('./pages/Wyjazdy'))
const Anomalie = lazy(() => import('./pages/Anomalie'))
const Budzety = lazy(() => import('./pages/Budzety'))
const Kolejka = lazy(() => import('./pages/Kolejka'))
const Transakcje = lazy(() => import('./pages/Transakcje'))
const Majatek = lazy(() => import('./pages/Majatek'))
const Ustawienia = lazy(() => import('./pages/Ustawienia'))

const TABS = [
  { id: 'pulpit', label: 'Pulpit' },
  { id: 'plan', label: 'Plan wypłaty' },
  { id: 'kategorie', label: 'Kategorie' },
  { id: 'sprzedawcy', label: 'Sprzedawcy' },
  { id: 'cykliczne', label: 'Cykliczne' },
  { id: 'wyjazdy', label: 'Wyjazdy' },
  { id: 'anomalie', label: 'Anomalie' },
  { id: 'budzety', label: 'Budżety' },
  { id: 'kolejka', label: 'Do sklasyfikowania' },
  { id: 'transakcje', label: 'Transakcje' },
  { id: 'majatek', label: 'Majątek' },
  { id: 'struktura', label: 'Struktura kont' },
  { id: 'ustawienia', label: 'Import' },
]

export default function BudzetShell() {
  const [tab, setTab] = useState(() => location.hash.replace('#budzet/', '') || 'pulpit')
  const [overview, setOverview] = useState<any>(null)
  const [cats, setCats] = useState<any[]>([])
  const [merchant, setMerchant] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const reload = () => {
    setErr(null)
    get('/api/overview').then(setOverview).catch((e) => setErr(e.message))
    get('/api/categories?business=0').then((d: any) => setCats(d.tree)).catch(() => {})
  }
  useEffect(reload, [])
  useEffect(() => { history.replaceState(null, '', `#budzet/${tab}`) }, [tab])

  const months = overview?.months ?? []
  const accounts = overview?.accounts ?? []
  const unknown = overview?.coverage?.unknown_n ?? 0
  const empty = overview && (overview.months?.length ?? 0) === 0
  // Zgoda PSD2 wygasa i trzeba ją odnowić ręcznie — po terminie pobieranie
  // po prostu milknie, więc ostrzegamy z wyprzedzeniem.
  const expiring = (overview?.bank ?? []).filter((b: any) => b.days_left != null && b.days_left <= 21)
  const failing = (overview?.bank ?? []).filter((b: any) => b.last_error)

  const drill = (m: string) => { setMerchant(m); setTab('transakcje') }

  return (
    <div className="bdz">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id}
            onClick={() => { setTab(t.id); if (t.id !== 'transakcje') setMerchant('') }}>
            {t.label}
            {t.id === 'kolejka' && unknown > 0 && <span className="chip w" style={{ marginLeft: 6 }}>{unknown}</span>}
          </button>
        ))}
      </div>

      {err && <div className="note" style={{ borderLeftColor: 'var(--bad)' }}>Błąd: {err}</div>}

      {expiring.map((b: any) => (
        <div key={b.id} className="note"
             style={{ borderLeftColor: b.days_left <= 3 ? 'var(--bad)' : 'var(--warn)' }}>
          <strong>{b.aspsp_name}</strong>: zgoda bankowa {b.days_left <= 0 ? 'wygasła'
            : `wygasa za ${b.days_left} ${b.days_left === 1 ? 'dzień' : 'dni'}`} ({String(b.valid_until).slice(0, 10)}).
          Bez odnowienia transakcje przestaną się pobierać.{' '}
          <button className="btn" style={{ padding: '3px 10px', marginLeft: 6 }}
                  onClick={() => setTab('ustawienia')}>Odnów połączenie</button>
        </div>
      ))}

      {failing.map((b: any) => (
        <div key={'e' + b.id} className="note" style={{ borderLeftColor: 'var(--bad)' }}>
          <strong>{b.aspsp_name}</strong>: ostatnie pobranie nie powiodło się — {String(b.last_error).slice(0, 160)}
        </div>
      ))}

      {empty && tab !== 'ustawienia' && (
        <div className="note">
          Nie ma jeszcze żadnych danych. Przejdź do zakładki <strong>Import</strong> i wgraj wyciągi CSV
          (obsługiwane formaty: Pekao i mBank). Konta wykryją się same.
        </div>
      )}

      <Suspense fallback={<div className="muted" style={{ padding: 24 }}>Ładowanie…</div>}>
        {tab === 'pulpit' && <Pulpit data={overview} />}
        {tab === 'plan' && <PlanWyplaty months={months} />}
        {tab === 'kategorie' && <Kategorie />}
        {tab === 'sprzedawcy' && <Sprzedawcy onDrill={drill} />}
        {tab === 'cykliczne' && <Cykliczne />}
        {tab === 'wyjazdy' && <Wyjazdy />}
        {tab === 'anomalie' && <Anomalie months={months} />}
        {tab === 'budzety' && <Budzety months={months} />}
        {tab === 'kolejka' && <Kolejka categories={cats} onChanged={reload} />}
        {tab === 'transakcje' && <Transakcje categories={cats} months={months} accounts={accounts} initialMerchant={merchant} />}
        {tab === 'majatek' && <Majatek onChanged={reload} />}
        {tab === 'struktura' && <Struktura onChanged={reload} />}
        {tab === 'ustawienia' && <Ustawienia onChanged={reload} />}
      </Suspense>
    </div>
  )
}
