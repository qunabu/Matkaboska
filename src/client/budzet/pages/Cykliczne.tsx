import React, { useEffect, useState } from 'react';
import { Card, Empty, Tile } from '../ui';
import { get, pln, MONTH_LABEL } from '../api';

export default function Cykliczne() {
  const [d, setD] = useState<any>(null);
  const [hideTransfers, setHide] = useState(true);
  useEffect(() => { get('/api/recurring').then(setD); }, []);
  if (!d) return <Empty>Ładowanie…</Empty>;

  const SKIP = ['transfer_gospod', 'podatek_vat', 'podatek_pit', 'zus'];
  const items = d.items.filter((i: any) => !hideTransfers || !SKIP.includes(i.category_id));
  const active = items.filter((i: any) => !i.stale);
  const stale = items.filter((i: any) => i.stale);
  const annual = active.reduce((a: any, b: any) => a + b.annual_cost, 0);
  const staleAnnual = stale.reduce((a: any, b: any) => a + b.annual_cost, 0);
  const k = d.kindergarten;

  const Row = ({ r }: any) => (
    <tr>
      <td className="ellip" title={r.merchant}>{r.merchant}
        <div className="muted" style={{ fontSize: 11 }}>{r.category_name}</div></td>
      <td><span className="chip">{r.cadence}</span></td>
      <td className="num">{pln(r.avg_amount)}
        {r.variability > 20 && <div className="muted" style={{ fontSize: 11 }}>{pln(r.min_amount)}–{pln(r.max_amount)}</div>}</td>
      <td className="num"><strong>{pln(r.annual_cost)}</strong></td>
      <td className="num muted">{r.n}</td>
      <td className="num muted">{r.last_seen}</td>
      <td>{r.stale ? <span className="chip w">nieaktywne</span> : <span className="chip g">aktywne</span>}</td>
    </tr>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Płatności cykliczne</h1>
          <p>Wykryte automatycznie z rytmu transakcji — abonamenty, opłaty stałe, zajęcia. Pozycje „nieaktywne” nie pojawiły się od dłuższego czasu niż ich zwykły cykl: albo je odwołałeś, albo warto sprawdzić dlaczego zniknęły.</p></div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={hideTransfers} onChange={(e: any) => setHide(e.target.checked)} /> ukryj podatki i transfery
        </label>
      </div>

      <div className="grid g3" style={{ marginBottom: 12 }}>
        <Tile label="Aktywne zobowiązania / rok" value={pln(annual)} sub={`${active.length} pozycji · ${pln(annual / 12)} miesięcznie`} />
        <Tile label="Wygasłe / rok" value={pln(staleAnnual)} sub={`${stale.length} pozycji — potwierdź, że faktycznie nie płacisz`} />
        <Tile label="Przedszkole" value={k ? pln(k.avg_paid) : '—'} sub={k ? `${pln(k.annual)} rocznie · baza ${pln(k.base_fee)} + wyżywienie` : ''} />
      </div>

      {k && (
        <Card title={`Przedszkole — rozbicie na opłatę stałą i wyżywienie (${k.food_rate} zł/dzień)`} style={{ marginBottom: 12 }}>
          <div className="scroll">
            <table>
              <thead><tr><th>Miesiąc</th><th className="num">Zapłacono</th><th className="num">Opłata bazowa</th><th className="num">Wyżywienie</th><th className="num">Dni wyżywienia</th></tr></thead>
              <tbody>{k.months.map((m: any) => (
                <tr key={m.month}><td>{MONTH_LABEL(m.month)}</td><td className="num">{pln(m.paid)}</td>
                  <td className="num muted">{pln(k.base_fee)}</td><td className="num">{pln(m.food)}</td><td className="num">{m.food_days}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Opłatę bazową przyjęto jako najniższą zaobserwowaną płatność; reszta to wyżywienie przeliczone po stawce dziennej (zmienisz ją w Ustawieniach).
          </p>
        </Card>
      )}

      <div className="grid g2">
        <Card title={`Aktywne (${active.length})`}>
          <div className="tallscroll scroll">
            <table><thead><tr><th>Pozycja</th><th>Cykl</th><th className="num">Kwota</th><th className="num">Rocznie</th><th className="num">n</th><th className="num">Ostatnio</th><th>Status</th></tr></thead>
              <tbody>{active.map((r: any) => <Row key={r.merchant} r={r} />)}</tbody></table>
          </div>
        </Card>
        <Card title={`Wygasłe lub nieregularne (${stale.length})`}>
          <div className="tallscroll scroll">
            <table><thead><tr><th>Pozycja</th><th>Cykl</th><th className="num">Kwota</th><th className="num">Rocznie</th><th className="num">n</th><th className="num">Ostatnio</th><th>Status</th></tr></thead>
              <tbody>{stale.map((r: any) => <Row key={r.merchant} r={r} />)}</tbody></table>
          </div>
        </Card>
      </div>
    </>
  );
}
