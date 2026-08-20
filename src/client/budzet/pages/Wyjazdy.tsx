import React, { useEffect, useState } from 'react';
import { Card, Empty, Tile } from '../ui';
import { get, pln } from '../api';

export default function Wyjazdy() {
  const [rows, setRows] = useState<any>(null);
  useEffect(() => { get('/api/trips').then(setRows); }, []);
  if (!rows) return <Empty>Ładowanie…</Empty>;
  const trips = rows.filter((r: any) => r.type === 'wyjazd');
  const bookings = rows.filter((r: any) => r.type === 'rezerwacja');
  const total = rows.reduce((a: any, b: any) => a + b.travel_cost, 0);

  const T = ({ list }: any) => (
    <div className="scroll"><table>
      <thead><tr><th>Nazwa</th><th>Okres</th><th className="num">Dni</th><th className="num">Koszt podróżny</th>
        <th className="num">Wszystkie wydatki w oknie</th><th>Największe pozycje</th></tr></thead>
      <tbody>{list.map((t: any) => (
        <tr key={t.from + t.name}>
          <td><strong>{t.name}</strong></td>
          <td className="muted">{t.from} → {t.to}</td>
          <td className="num">{t.days}</td>
          <td className="num"><strong>{pln(t.travel_cost)}</strong></td>
          <td className="num muted">{pln(t.window_spend)}</td>
          <td style={{ fontSize: 12 }}>{t.top_merchants.map((m: any) => `${m.merchant} ${pln(m.total)}`).join(' · ')}</td>
        </tr>
      ))}</tbody></table></div>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Wyjazdy</h1>
          <p>Transakcje podróżne pogrupowane w okna czasowe. „Rezerwacja” to pojedynczy zakup z wyprzedzeniem (lot, hotel) — data płatności nie jest datą wyjazdu. „Wszystkie wydatki w oknie” obejmują też jedzenie i zakupy w tym okresie, więc pokazują pełny koszt bycia w podróży.</p></div>
      </div>
      <div className="grid g3" style={{ marginBottom: 12 }}>
        <Tile label="Koszty podróżne razem" value={pln(total)} sub={`${rows.length} skupisk w całym okresie`} />
        <Tile label="Wyjazdy" value={String(trips.length)} sub={pln(trips.reduce((a: any, b: any) => a + b.travel_cost, 0))} />
        <Tile label="Rezerwacje z wyprzedzeniem" value={String(bookings.length)} sub={pln(bookings.reduce((a: any, b: any) => a + b.travel_cost, 0))} />
      </div>
      <Card title={`Wyjazdy (${trips.length})`} style={{ marginBottom: 12 }}>
        {trips.length ? <T list={trips} /> : <Empty>Brak wyjazdów spełniających kryteria.</Empty>}
      </Card>
      <Card title={`Rezerwacje i pojedyncze zakupy podróżne (${bookings.length})`}>
        {bookings.length ? <T list={bookings} /> : <Empty>Brak.</Empty>}
      </Card>
    </>
  );
}
