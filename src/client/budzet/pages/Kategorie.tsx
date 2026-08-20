import React, { useEffect, useState } from 'react';
import { BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RT, Legend as RL } from 'recharts';
import { Card, Empty, Bar, Tooltip } from '../ui';
import { get, pln, MONTH_LABEL, SERIES } from '../api';

const axis = { stroke: 'var(--text-muted)', fontSize: 11 };

export default function Kategorie() {
  const [d, setD] = useState<any>(null);
  const [scope, setScope] = useState('0');            // 0 = prywatne, 1 = firmowe, '' = wszystko
  const [open, setOpen] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => { get(`/api/categories${scope === '' ? '' : `?business=${scope}`}`).then(setD); }, [scope]);
  useEffect(() => { if (open) get(`/api/category/${open}`).then(setDetail); else setDetail(null); }, [open]);

  if (!d) return <Empty>Ładowanie…</Empty>;
  // Transfery to przepływy, nie konsumpcja — pokazujemy je osobno, żeby nie
  // przytłaczały rankingu (przelew do gospodarstwa jest większy niż wszystko inne).
  const transfers = d.breakdown.filter((r: any) => r.group === 'Transfery');
  const rows = d.breakdown.filter((r: any) => r.group !== 'Transfery');
  const max = Math.max(...rows.map((r: any) => r.total), 1);
  const total = rows.reduce((a: any, b: any) => a + b.total, 0);

  const stack = Object.entries(d.groups_by_month).sort().map(([m, g]) => ({ label: MONTH_LABEL(m), ...(g as Record<string, number>) }));
  // Serie wykresu bierzemy z danych, a nie z rankingu — inaczej legenda pokazuje puste grupy.
  const groups = [...new Set(stack.flatMap((r: any) => Object.keys(r)))].filter((k: any) => k !== 'label')
    .sort((a: string, b: string) => stack.reduce((s: number, r: any) => s + (r[b] || 0), 0) - stack.reduce((s: number, r: any) => s + (r[a] || 0), 0))
    .slice(0, 8);

  return (
    <>
      <div className="page-head">
        <div><h1>Kategorie</h1><p>Na co idą pieniądze. Kliknij kategorię, żeby zobaczyć jej przebieg w czasie i sprzedawców.</p></div>
        <select value={scope} onChange={(e: any) => setScope(e.target.value)}>
          <option value="0">Wydatki prywatne</option>
          <option value="1">Koszty firmowe</option>
          <option value="">Wszystko razem</option>
        </select>
      </div>

      <Card title="Struktura wydatków prywatnych wg grup (miesięcznie)" style={{ marginBottom: 12 }}>
        <div style={{ height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={stack} margin={{ top: 6, right: 8, left: 4, bottom: 22 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" {...axis} tickLine={false} interval={0} angle={-40} textAnchor="end" height={50} />
              <YAxis {...axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={44} />
              <RT content={<Tooltip />} cursor={{ fill: 'var(--surface-2)' }} />
              <RL wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              {groups.map((g: any, i: number) => (
                <RBar key={g} dataKey={g} stackId="s" fill={SERIES[i % 8]} name={g}
                      radius={i === groups.length - 1 ? [4, 4, 0, 0] : 0} stroke="var(--surface-1)" strokeWidth={2} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid g2">
        <Card title={`Ranking kategorii — ${pln(total)} łącznie`}
              actions={transfers.length ? <span className="chip">+ transfery {pln(transfers.reduce((a: number, b: any) => a + b.total, 0))} osobno</span> : null}>
          <div className="tallscroll">
            <table>
              <thead><tr><th>Kategoria</th><th></th><th className="num">Miesięcznie</th><th className="num">Razem</th><th className="num">Ile</th></tr></thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.category_id} onClick={() => setOpen(r.category_id)} style={{ cursor: 'pointer' }}>
                    <td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.group}</div></td>
                    <td style={{ width: 90 }}><Bar value={r.total} max={max} /></td>
                    <td className="num">{pln(r.per_month)}</td>
                    <td className="num">{pln(r.total)}</td>
                    <td className="num muted">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={open ? `Szczegóły: ${rows.find((r: any) => r.category_id === open)?.name || open}` : 'Szczegóły kategorii'}>
          {!open && <Empty>Wybierz kategorię z listy obok.</Empty>}
          {open && detail && (
            <>
              <div style={{ height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={detail.series.map((s: any) => ({ ...s, label: MONTH_LABEL(s.month) }))} margin={{ top: 4, right: 6, left: 4, bottom: 18 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="label" {...axis} tickLine={false} angle={-40} textAnchor="end" height={44} interval={0} />
                    <YAxis {...axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={42} />
                    <RT content={<Tooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                    <RBar dataKey="total" name="Wydatki" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="tallscroll" style={{ maxHeight: 300, marginTop: 10 }}>
                <table>
                  <thead><tr><th>Sprzedawca</th><th className="num">Razem</th><th className="num">Ile</th></tr></thead>
                  <tbody>{detail.merchants.map((m: any) => (
                    <tr key={m.merchant}><td>{m.merchant}</td><td className="num">{pln(m.total)}</td><td className="num muted">{m.n}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
