import React, { useEffect, useState } from 'react';
import { Card, Empty } from '../ui';
import { get, post, pln } from '../api';

export default function Kolejka({ categories, onChanged }: any) {
  const [rows, setRows] = useState<any>(null);
  const [sel, setSel] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState<any>(null);
  const load = () => get('/api/review-queue').then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows) return <Empty>Ładowanie…</Empty>;
  if (!rows.length) return (<><div className="page-head"><h1>Do sklasyfikowania</h1></div><Empty>Wszystko sklasyfikowane. 🎉</Empty></>);

  const apply = async (r: any, createRule: boolean) => {
    const cat = sel[r.merchant];
    if (!cat) return;
    setBusy(r.merchant);
    await post('/api/classify-merchant', { merchant: r.merchant, category_id: cat, create_rule: createRule });
    setBusy(null); load(); onChanged?.();
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Do sklasyfikowania</h1>
          <p>Transakcje, których nie rozpoznała żadna reguła ani kategoria bankowa. Przypisz kategorię jednym kliknięciem — „Zapisz + reguła” sprawi, że ten sprzedawca będzie już zawsze rozpoznawany automatycznie, także przy kolejnych importach.</p></div>
      </div>
      <Card>
        <div className="tallscroll" style={{ maxHeight: 680 }}>
          <table>
            <thead><tr><th>Sprzedawca</th><th className="num">Kwota</th><th className="num">Ile</th><th>Okres</th><th>Kategoria banku</th><th style={{ minWidth: 210 }}>Przypisz</th><th></th></tr></thead>
            <tbody>{rows.map((r: any) => (
              <tr key={r.merchant}>
                <td style={{ maxWidth: 300 }}>{r.merchant}
                  <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{r.sample_desc}</div></td>
                <td className="num"><strong>{pln(r.total)}</strong></td>
                <td className="num muted">{r.n}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.first_seen}<br />{r.last_seen}</td>
                <td><span className="chip">{r.bank_categories || '—'}</span></td>
                <td>
                  <select value={sel[r.merchant] || ''} onChange={(e: any) => setSel({ ...sel, [r.merchant]: e.target.value })} style={{ width: '100%' }}>
                    <option value="">— wybierz —</option>
                    {categories.filter((c: any) => c.id !== 'do_sklasyfikowania').map((c: any) => (
                      <option key={c.id} value={c.id}>{c.group} › {c.name}</option>
                    ))}
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost" disabled={!sel[r.merchant] || busy === r.merchant} onClick={() => apply(r, false)} style={{ padding: '4px 8px' }}>Zapisz</button>
                  <button className="btn" disabled={!sel[r.merchant] || busy === r.merchant} onClick={() => apply(r, true)} style={{ padding: '4px 8px', marginLeft: 4 }}>+ reguła</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
