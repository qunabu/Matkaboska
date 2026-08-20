import React, { useEffect, useState } from 'react';
import { Card, Empty } from '../ui';
import { get, put, pln } from '../api';

export default function Struktura({ onChanged }: any) {
  const [d, setD] = useState<any>(null);
  const [dirty, setDirty] = useState<any>({});
  const load = () => get('/api/structure').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Empty>Ładowanie…</Empty>;

  const save = async () => {
    const items = Object.entries(dirty).map(([category_id, target]) => ({ category_id, target }));
    if (!items.length) return;
    await put('/api/structure', { items });
    setDirty({}); load(); onChanged?.();
  };

  const byTarget: Record<string, any[]> = {};
  for (const c of d.categories) {
    const t = dirty[c.id] ?? c.target;
    (byTarget[t] ??= []).push(c);
  }
  const groups = [...new Set(d.categories.map((c: any) => c.group))];

  return (
    <>
      <div className="page-head">
        <div><h1>Struktura kont</h1>
          <p>Z którego konta <strong>ma</strong> być opłacana każda kategoria. To nie jest opis przeszłości — historycznie wydatki były mieszane między kontami, więc plan wypłaty liczy zapotrzebowanie każdego konta z sumy przypisanych mu kategorii, a nie z tego, co z niego kiedyś wychodziło.</p></div>
        <button className="btn" onClick={save} disabled={!Object.keys(dirty).length}>
          Zapisz {Object.keys(dirty).length ? `(${Object.keys(dirty).length})` : ''}
        </button>
      </div>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        {d.targets.filter((t: any) => t.id !== 'pomijaj').map((t: any) => (
          <div className="card tile" key={t.id}>
            <div className="label">{t.name}</div>
            <div className="value" style={{ fontSize: 22 }}>{(byTarget[t.id] || []).length}</div>
            <div className="sub">kategorii</div>
          </div>
        ))}
      </div>

      {groups.map((g: any) => (
        <Card key={g} title={g} style={{ marginBottom: 12 }}>
          <div className="scroll"><table>
            <thead><tr><th>Kategoria</th><th>Charakter</th><th style={{ minWidth: 250 }}>Płacone z</th></tr></thead>
            <tbody>{d.categories.filter((c: any) => c.group === g).map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><span className="chip">{c.nature}</span></td>
                <td>
                  <select value={dirty[c.id] ?? c.target} style={{ width: '100%' }}
                    onChange={(e: any) => setDirty({ ...dirty, [c.id]: e.target.value })}>
                    {d.targets.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      ))}
    </>
  );
}
