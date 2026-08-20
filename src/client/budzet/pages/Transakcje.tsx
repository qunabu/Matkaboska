import React, { useEffect, useState } from 'react';
import { Card, Empty } from '../ui';
import { get, patch, pln2, MONTH_LABEL } from '../api';

export default function Transakcje({ categories, months, accounts, initialMerchant }: any) {
  const [f, setF] = useState({ month: '', category: '', account: '', q: '', merchant: initialMerchant || '', internal: '0' });
  const [d, setD] = useState<any>(null);
  useEffect(() => { setF((x) => ({ ...x, merchant: initialMerchant || '' })); }, [initialMerchant]);
  const load = () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('limit', '500');
    get(`/api/transactions?${p}`).then(setD);
  };
  useEffect(() => { load(); }, [JSON.stringify(f)]);

  const setCat = async (id: number, category_id: string) => { await patch(`/api/transactions/${id}`, { category_id }); load(); };
  const toggleBiz = async (t: any) => { await patch(`/api/transactions/${t.id}`, { is_business: !t.is_business }); load(); };

  return (
    <>
      <div className="page-head">
        <div><h1>Transakcje</h1><p>Pełna lista z możliwością ręcznej korekty. Zmiana kategorii tutaj jest trwała i nie zostanie nadpisana przy ponownym przeliczeniu reguł.</p></div>
      </div>
      <div className="toolbar">
        <select value={f.month} onChange={(e: any) => setF({ ...f, month: e.target.value })}>
          <option value="">Wszystkie miesiące</option>
          {[...(months || [])].reverse().map((m: any) => <option key={m} value={m}>{MONTH_LABEL(m)}</option>)}
        </select>
        <select value={f.category} onChange={(e: any) => setF({ ...f, category: e.target.value })}>
          <option value="">Wszystkie kategorie</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.group} › {c.name}</option>)}
        </select>
        <select value={f.account} onChange={(e: any) => setF({ ...f, account: e.target.value })}>
          <option value="">Wszystkie konta</option>
          {(accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.short}</option>)}
        </select>
        <input type="text" placeholder="Szukaj w opisie…" value={f.q} onChange={(e: any) => setF({ ...f, q: e.target.value })} style={{ minWidth: 200 }} />
        {f.merchant && <span className="chip b" onClick={() => setF({ ...f, merchant: '' })} style={{ cursor: 'pointer' }}>sprzedawca: {f.merchant} ×</span>}
        <label style={{ fontSize: 13, display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={f.internal === '1'} onChange={(e: any) => setF({ ...f, internal: e.target.checked ? '1' : '0' })} /> pokaż przelewy wewnętrzne
        </label>
        {d && <span className="muted">{d.total} pozycji · suma {pln2(d.sum)}</span>}
      </div>
      <Card>
        {!d ? <Empty>Ładowanie…</Empty> : (
          <div className="tallscroll" style={{ maxHeight: 700 }}>
            <table>
              <thead><tr><th>Data</th><th>Konto</th><th>Sprzedawca / opis</th><th className="num">Kwota</th><th style={{ minWidth: 180 }}>Kategoria</th><th>Typ</th></tr></thead>
              <tbody>{d.rows.map((t: any) => (
                <tr key={t.id} style={t.is_internal ? { opacity: .55 } : undefined}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.booked_on}</td>
                  <td><span className="chip">{(accounts || []).find((a: any) => a.id === t.account_id)?.short || t.account_id}</span></td>
                  <td style={{ maxWidth: 340 }}>{t.counterparty_norm}
                    <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div></td>
                  <td className={`num ${t.amount < 0 ? '' : 'pos'}`}>{pln2(t.amount)}</td>
                  <td>
                    <select value={t.category_id} onChange={(e: any) => setCat(t.id, e.target.value)} style={{ width: '100%', fontSize: 12 }}>
                      {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {t.category_source === 'manual' && <span className="chip b" style={{ marginTop: 3 }}>ręcznie</span>}
                    {t.category_source === 'bank' && <span className="chip" style={{ marginTop: 3 }}>z banku</span>}
                  </td>
                  <td>
                    <span className={`chip ${t.is_business ? 'b' : ''}`} onClick={() => toggleBiz(t)} style={{ cursor: 'pointer' }}>
                      {t.is_business ? 'firmowe' : 'prywatne'}
                    </span>
                    {t.is_internal ? <div><span className="chip">wewnętrzny</span></div> : null}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
