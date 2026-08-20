import React, { useEffect, useState } from 'react';
import { Card, Empty, Bar } from '../ui';
import { get, pln, pln2 } from '../api';

export default function Sprzedawcy({ onDrill }: any) {
  const [rows, setRows] = useState<any>(null);
  const [scope, setScope] = useState('0');
  const [q, setQ] = useState('');
  useEffect(() => { get(`/api/merchants?limit=150${scope === '' ? '' : `&business=${scope}`}`).then(setRows); }, [scope]);
  if (!rows) return <Empty>Ładowanie…</Empty>;
  const f = rows.filter((r: any) => r.merchant.toLowerCase().includes(q.toLowerCase()));
  const max = Math.max(...rows.map((r: any) => r.total), 1);

  return (
    <>
      <div className="page-head">
        <div><h1>Sprzedawcy</h1><p>Gdzie faktycznie zostawiasz pieniądze. Kliknij wiersz, aby zobaczyć transakcje.</p></div>
      </div>
      <div className="toolbar">
        <select value={scope} onChange={(e: any) => setScope(e.target.value)}>
          <option value="0">Prywatne</option><option value="1">Firmowe</option><option value="">Wszystko</option>
        </select>
        <input type="text" placeholder="Szukaj sprzedawcy…" value={q} onChange={(e: any) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <span className="muted">{f.length} pozycji</span>
      </div>
      <Card>
        <div className="tallscroll" style={{ maxHeight: 640 }}>
          <table>
            <thead><tr><th>#</th><th>Sprzedawca</th><th>Kategoria</th><th></th><th className="num">Razem</th>
              <th className="num">Transakcji</th><th className="num">Śr. paragon</th><th className="num">Ostatnio</th></tr></thead>
            <tbody>
              {f.map((r: any, i: number) => (
                <tr key={r.merchant} onClick={() => onDrill?.(r.merchant)} style={{ cursor: 'pointer' }}>
                  <td className="muted">{i + 1}</td>
                  <td>{r.merchant}</td>
                  <td><span className="chip">{r.category_name}</span></td>
                  <td style={{ width: 80 }}><Bar value={r.total} max={max} /></td>
                  <td className="num"><strong>{pln(r.total)}</strong></td>
                  <td className="num muted">{r.n}</td>
                  <td className="num muted">{pln2(r.avg_ticket)}</td>
                  <td className="num muted">{r.last_seen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
