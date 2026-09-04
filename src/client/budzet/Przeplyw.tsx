import { pln } from './api'

/**
 * Diagram przepływu z góry na dół — jednocześnie wyliczenie na dany miesiąc
 * i trwałe przypomnienie przyjętej struktury: co ile dostaje i za co odpowiada.
 * Zasada jest jedna: kwoty na subkonto, ING i mBank są przewidywalne, a wszystko,
 * co zostaje, ląduje na koncie prywatnym (hub). Jego saldo to oszczędności —
 * bez zgadywania.
 *
 * Nazwy rachunków bierzemy z `p.accounts`, nie z kodu: hubem jest „Pekao —
 * prywatne", a wpisane na sztywno „PKO" (inny bank!) myliło przy odczytywaniu
 * przelewów z panelu.
 */

type Node = {
  key: string
  title: string
  amount: number
  covers: string[]
  color: string
  note?: string
}

function Box({ n, wide }: { n: Node; wide?: boolean }) {
  return (
    <div className="bdz-node" style={{ borderTopColor: n.color, flex: wide ? '1 1 100%' : '1 1 0' }}>
      <div className="bdz-node-title">{n.title}</div>
      <div className="bdz-node-amount">{pln(n.amount)}</div>
      <ul className="bdz-node-covers">{n.covers.map((c) => <li key={c}>{c}</li>)}</ul>
      {n.note && <div className="bdz-node-note">{n.note}</div>}
    </div>
  )
}

export default function Przeplyw({ p }: { p: any }) {
  if (!p) return null
  const inp = p.input
  const bonus = inp.bonus_gross > 0
  const hub = p.accounts?.hub || 'konto prywatne'
  const ing = p.accounts?.household || 'ING'
  const daily = p.accounts?.daily || 'mBank'

  const poziom1: Node[] = [
    {
      key: 'tax', title: 'Subkonto podatkowe', amount: p.subkonto.total, color: 'var(--series-2)',
      covers: ['VAT za kwartał', 'PIT-28 i ZUS', 'rata za biuro', 'telefon i internet'],
      note: `rezerwa docelowa ${pln(p.reserve.required)}`,
    },
    {
      key: 'biz', title: 'Zostaje na firmowym', amount: p.company.keep, color: 'var(--series-4)',
      covers: ['koszty działalności', 'mini poduszka'],
      note: `bufor docelowy ${pln(p.company.buffer_target)}`,
    },
    {
      key: 'hub', title: hub, amount: p.private.total, color: 'var(--series-1)',
      covers: ['tylko przelewy i oszczędności', 'stąd zasilasz gospodarstwo i codzienne', 'nic nie płacisz stąd wprost'],
      note: p.structure_from
        ? (p.structure_from.date
            ? `konto przelotowe i skarbonka — od ${p.structure_from.date}`
            : 'konto przelotowe i skarbonka — od najbliższego przelewu z faktury')
        : 'konto przelotowe i skarbonka',
    },
  ]

  const poziom2: Node[] = [
    {
      key: 'ing', title: `${ing} — gospodarstwo`, amount: p.private.ing + p.private.adhoc, color: 'var(--series-7)',
      covers: ['bieżące życie domu', 'gaz i prąd', 'rata hipoteki'],
      note: p.private.adhoc > 0 ? `w tym ${pln(p.private.adhoc)} doraźnych` : undefined,
    },
    {
      key: 'daily', title: `${daily} — wszystkie wydatki`, amount: p.private.mbank, color: 'var(--series-3)',
      covers: ['jedzenie, zakupy, dzieci', 'zdrowie, ubrania, dom', 'wszystko niefirmowe'],
      note: p.steady.mbank_topups > 0
        ? `w drogim miesiącu dopłacasz z ${hub}, średnio ${pln(p.steady.mbank_topups)}`
        : undefined,
    },
    {
      key: 'save', title: `Zostaje na ${hub}`, amount: p.private.savings, color: 'var(--series-6)',
      covers: ['to są Twoje oszczędności', 'z tego idą wakacje', 'i większe losowe wydatki'],
      note: `saldo tego konta = ile masz odłożone · średnio ${pln(p.steady.pko_outflow)}/mies. schodzi na dopłaty i wyjazdy`,
    },
  ]

  return (
    <div className="bdz-flow">
      <div className="bdz-node bdz-node-top" style={{ borderTopColor: 'var(--text-primary)' }}>
        <div className="bdz-node-title">Wpływ na konto firmowe</div>
        <div className="bdz-node-amount" style={{ fontSize: 30 }}>{pln(inp.gross)}</div>
        <div className="bdz-node-note">
          {bonus
            ? `faktura ${pln(inp.invoice)} + premia ${pln(inp.bonus_net)} netto (${pln(inp.bonus_gross)} brutto)`
            : `w tym VAT ${pln(inp.vat)} — nie jest Twoim dochodem`}
        </div>
      </div>

      <div className="bdz-arrow" />
      <div className="bdz-row">{poziom1.map((n) => <Box key={n.key} n={n} />)}</div>

      <div className="bdz-arrow bdz-arrow-right" />
      <div className="bdz-sub">z {hub} dzielisz dalej</div>
      <div className="bdz-row">{poziom2.map((n) => <Box key={n.key} n={n} />)}</div>

      {p.structure_from && (
        <div className="note" style={{ marginTop: 14 }}>
          {p.structure_from.date ? (
            <>Struktura obowiązuje od <strong>{p.structure_from.date}</strong> — dnia, w którym
            wpłynęła faktura. Wcześniejsze wydatki bywały płacone z różnych rachunków, więc saldo
            {' '}{hub} odpowiada stanowi oszczędności dopiero od tego momentu.</>
          ) : (
            <>Struktura zacznie obowiązywać <strong>od przelewu z faktury</strong> (spodziewany
            na początku {p.structure_from.month}) — nie od 1. dnia miesiąca. Do tego czasu
            pieniądze rozchodzą się jeszcze po staremu, a saldo {hub} nie jest miarą oszczędności.</>
          )}
        </div>
      )}

      {p.private.savings < 0 && (
        <div className="note" style={{ borderLeftColor: 'var(--bad)', marginTop: 14 }}>
          Przy tej fakturze na {hub} nie zostaje nic — brakuje {pln(Math.abs(p.private.savings))}.
          Trzeba sięgnąć do zapasu albo obniżyć któryś ze stałych przelewów.
        </div>
      )}
    </div>
  )
}
