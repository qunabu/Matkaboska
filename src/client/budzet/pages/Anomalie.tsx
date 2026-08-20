import React, { useEffect, useState } from 'react';
import { Card, Empty } from '../ui';
import { get, pln, MONTH_LABEL } from '../api';

export default function Anomalie({ months }: any) {
  const [m, setM] = useState('');
  const [d, setD] = useState<any>(null);
  useEffect(() => { get(`/api/anomalies${m ? `?month=${m}` : ''}`).then(setD); }, [m]);
  if (!d) return <Empty>Ładowanie…</Empty>;
  const up = d.items.filter((i: any) => i.delta > 0);
  const down = d.items.filter((i: any) => i.delta < 0);

  const T = ({ list, tone }: any) => (
    <table><thead><tr><th>Kategoria</th><th className="num">Ten miesiąc</th><th className="num">Zwykle</th><th className="num">Różnica</th><th className="num">%</th></tr></thead>
      <tbody>{list.map((i: any) => (
        <tr key={i.category_id}><td>{i.name}</td><td className="num">{pln(i.current)}</td>
          <td className="num muted">{pln(i.baseline)}</td>
          <td className={`num ${tone}`}><strong>{i.delta > 0 ? '+' : ''}{pln(i.delta)}</strong></td>
          <td className="num muted">{i.pct == null ? 'nowe' : `${i.pct > 0 ? '+' : ''}${i.pct.toFixed(0)}%`}</td></tr>
      ))}</tbody></table>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Anomalie</h1><p>Porównanie wybranego miesiąca z medianą {d.baseline_months?.length} poprzednich. Pokazane tylko różnice powyżej 300 zł.</p></div>
        <select value={m} onChange={(e: any) => setM(e.target.value)}>
          <option value="">Ostatni miesiąc</option>
          {[...(months || [])].reverse().map((x: any) => <option key={x} value={x}>{MONTH_LABEL(x)}</option>)}
        </select>
      </div>
      <div className="note">Analizowany miesiąc: <strong>{MONTH_LABEL(d.month)}</strong> · baza: {d.baseline_months?.map(MONTH_LABEL).join(', ')}</div>
      <div className="grid g2">
        <Card title={`Wzrosty (${up.length})`}>{up.length ? <T list={up} tone="neg" /> : <Empty>Nic nie wystrzeliło.</Empty>}</Card>
        <Card title={`Spadki (${down.length})`}>{down.length ? <T list={down} tone="pos" /> : <Empty>Brak spadków.</Empty>}</Card>
      </div>
    </>
  );
}
