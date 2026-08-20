import React, { useEffect, useState } from 'react';
import { Card, Empty, Bar, Tile } from '../ui';
import { get, put, del, pln, MONTH_LABEL } from '../api';

export default function Budzety({ months }: any) {
  const [d, setD] = useState<any>(null);
  const [m, setM] = useState('');
  const [draft, setDraft] = useState<any>({});
  const load = () => get(`/api/budgets${m ? `?month=${m}` : ''}`).then(setD);
  useEffect(() => { load(); }, [m]);
  if (!d) return <Empty>Ładowanie…</Empty>;

  const applyAll = async () => {
    await put('/api/budgets', { items: d.suggested.map((s: any) => ({ category_id: s.category_id, monthly_limit: s.suggested, source: 'suggested' })) });
    load();
  };
  const saveOne = async (cat: string, v: any) => { await put('/api/budgets', { items: [{ category_id: cat, monthly_limit: Number(v), source: 'manual' }] }); load(); };
  const over = d.status.filter((s: any) => s.over);
  const totalLimit = d.status.reduce((a: any, b: any) => a + b.limit, 0);
  const totalSpent = d.status.reduce((a: any, b: any) => a + b.spent, 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Budżety</h1><p>Cele są proponowane z Twojej własnej mediany miesięcznej — nie z arbitralnych norm. Mediana ignoruje jednorazowe skoki (wyjazdy), więc cel odpowiada normalnemu miesiącowi.</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={m} onChange={(e: any) => setM(e.target.value)}>
            <option value="">Ostatni miesiąc</option>
            {[...(months || [])].reverse().map((x: any) => <option key={x} value={x}>{MONTH_LABEL(x)}</option>)}
          </select>
          <button className="btn" onClick={applyAll}>Ustaw wszystkie z mediany</button>
        </div>
      </div>

      {d.status.length > 0 && (
        <div className="grid g3" style={{ marginBottom: 12 }}>
          <Tile label="Limit łączny" value={pln(totalLimit)} sub={`${d.status.length} kategorii z celem`} />
          <Tile label="Wydano" value={pln(totalSpent)} tone={totalSpent > totalLimit ? 'neg' : 'pos'} sub={`${((totalSpent / (totalLimit || 1)) * 100).toFixed(0)}% limitu`} />
          <Tile label="Przekroczone" value={String(over.length)} tone={over.length ? 'neg' : 'pos'} sub={over.map((o: any) => o.name).slice(0, 3).join(', ') || 'brak'} />
        </div>
      )}

      <div className="grid g2">
        <Card title="Realizacja w wybranym miesiącu">
          {!d.status.length && <Empty>Nie ustawiono jeszcze żadnych celów. Użyj przycisku powyżej.</Empty>}
          {!!d.status.length && (
            <div className="tallscroll"><table>
              <thead><tr><th>Kategoria</th><th></th><th className="num">Wydano</th><th className="num">Limit</th><th className="num">Zostało</th></tr></thead>
              <tbody>{d.status.map((s: any) => (
                <tr key={s.category_id}>
                  <td>{s.name}</td>
                  <td style={{ width: 100 }}><Bar value={s.spent} max={s.limit} color={s.over ? 'var(--series-8)' : s.pct > 80 ? 'var(--series-4)' : 'var(--series-3)'} /></td>
                  <td className="num">{pln(s.spent)}</td>
                  <td className="num muted">{pln(s.limit)}</td>
                  <td className={`num ${s.over ? 'neg' : 'pos'}`}>{pln(s.remaining)}</td>
                </tr>
              ))}</tbody></table></div>
          )}
        </Card>

        <Card title="Propozycje celów (mediana miesięczna)">
          <div className="tallscroll"><table>
            <thead><tr><th>Kategoria</th><th className="num">Mediana</th><th className="num">Maks.</th><th className="num">Cel</th><th></th></tr></thead>
            <tbody>{d.suggested.map((s: any) => {
              const cur = d.current.find((c: any) => c.category_id === s.category_id);
              return (
                <tr key={s.category_id}>
                  <td>{s.name}<div className="muted" style={{ fontSize: 11 }}>{s.group}</div></td>
                  <td className="num muted">{pln(s.median)}</td>
                  <td className="num muted">{pln(s.max)}</td>
                  <td className="num">
                    <input type="number" style={{ width: 92 }}
                      defaultValue={cur ? cur.monthly_limit : s.suggested}
                      onChange={(e: any) => setDraft({ ...draft, [s.category_id]: e.target.value })} />
                  </td>
                  <td>
                    <button className="btn ghost" style={{ padding: '3px 8px' }}
                      onClick={() => saveOne(s.category_id, draft[s.category_id] ?? (cur ? cur.monthly_limit : s.suggested))}>Zapisz</button>
                    {cur && <button className="btn ghost" style={{ padding: '3px 8px', marginLeft: 4 }}
                      onClick={async () => { await del(`/api/budgets/${s.category_id}`); load(); }}>×</button>}
                  </td>
                </tr>
              );
            })}</tbody></table></div>
        </Card>
      </div>
    </>
  );
}
