import React, { useEffect, useRef, useState } from 'react';
import { Card, Empty } from '../ui';
import { get, put, post, del, pln } from '../api';

const LABELS = {
  vat_rate: ['Stawka VAT', 'Ułamek, np. 0.23 dla 23%.'],
  company_buffer_target: ['Bufor na koncie firmowym (zł)', 'Ile zostawiasz na koncie firmowym; nadwyżka ponad tę kwotę jest wskazywana jako gotowa do odłożenia.'],
  kindergarten_food_rate: ['Stawka wyżywienia w przedszkolu (zł/dzień)', 'Służy do rozbicia opłaty na część stałą i wyżywienie.'],
  emergency_months_target: ['Poduszka — cel w miesiącach', 'Ile miesięcy kosztów bazowych chcesz mieć odłożone.'],
  household_transfer_mortgage: ['Rata kredytu w transferze do gospodarstwa (zł)', 'Część przelewu na ING, która idzie na hipotekę.'],
};

export default function Ustawienia({ onChanged }: any) {
  const [s, setS] = useState<any>(null);
  const [imports, setImports] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [log, setLog] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = () => { get('/api/settings').then(setS); get('/api/imports').then(setImports); get('/api/rules').then(setRules); };
  useEffect(() => { load(); }, []);
  if (!s) return <Empty>Ładowanie…</Empty>;

  const save = async (k: string, v: any) => { await put('/api/settings', { [k]: v }); setS({ ...s, [k]: v }); onChanged?.(); };

  const upload = async (e: any) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true); setLog(null);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    try {
      const r = await fetch('/api/import', { method: 'POST', body: fd });
      const j = await r.json();
      setLog(j.error ? { error: j.error } : j);
      load(); onChanged?.();
    } catch (err) { setLog({ error: (err as Error).message }); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const recalc = async () => { setBusy(true); await post('/api/recategorise', {}); load(); onChanged?.(); setBusy(false); };

  return (
    <>
      <div className="page-head"><div><h1>Import i ustawienia</h1>
        <p>Co miesiąc pobierz nowe wyciągi i wrzuć je tutaj. Duplikaty są wykrywane po numerze referencyjnym, więc nakładające się okresy nie zaburzą danych — możesz spokojnie wgrać cały rok jeszcze raz.</p></div></div>

      <Card title="Wgraj wyciągi CSV" style={{ marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept=".csv" multiple onChange={upload} disabled={busy} />
        <p className="muted" style={{ fontSize: 12 }}>Obsługiwane formaty: Pekao (firmowe, subkonto, prywatne) i mBank (konto + karta). Rozpoznawane automatycznie.</p>
        {busy && <p>Przetwarzanie…</p>}
        {log?.error && <p className="neg">Błąd: {log.error}</p>}
        {log?.results && (
          <table><thead><tr><th>Plik</th><th>Format</th><th className="num">Nowe</th><th className="num">Duplikaty</th></tr></thead>
            <tbody>{log.results.map((r: any) => (
              <tr key={r.file}><td>{r.file}</td><td><span className="chip">{r.format}</span></td>
                <td className="num pos">{r.inserted}</td><td className="num muted">{r.duplicates}</td></tr>
            ))}</tbody></table>
        )}
      </Card>

      <div className="grid g2" style={{ marginBottom: 12 }}>
        <Card title="Parametry">
          <table><tbody>
            {Object.entries(LABELS).map(([k, [label, hint]]) => (
              <tr key={k}>
                <td>{label}<div className="muted" style={{ fontSize: 11 }}>{hint}</div></td>
                <td className="num"><input type="number" step="any" defaultValue={s[k]} style={{ width: 110 }}
                  onBlur={(e: any) => e.target.value !== s[k] && save(k, e.target.value)} /></td>
              </tr>
            ))}
          </tbody></table>
          <div style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={recalc} disabled={busy}>Przelicz reguły od nowa</button>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Ręczne korekty zostaną zachowane.</span>
          </div>
        </Card>

        <Card title="Historia importów">
          <div className="tallscroll" style={{ maxHeight: 300 }}>
            <table><thead><tr><th>Plik</th><th>Kiedy</th><th className="num">Nowe</th><th className="num">Dup.</th></tr></thead>
              <tbody>{imports.map((i: any) => (
                <tr key={i.id}><td style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.filename}
                  <div className="muted" style={{ fontSize: 11 }}>{i.period_from} → {i.period_to}</div></td>
                  <td className="muted" style={{ fontSize: 12 }}>{i.imported_at}</td>
                  <td className="num pos">{i.rows_new}</td><td className="num muted">{i.rows_dup}</td></tr>
              ))}</tbody></table>
          </div>
        </Card>
      </div>

      <Card title={`Reguły kategoryzacji (${rules.length})`}>
        <div className="tallscroll" style={{ maxHeight: 420 }}>
          <table><thead><tr><th className="num">Prio</th><th>Wzorzec</th><th>Kategoria</th><th>Typ</th><th className="num">Trafień</th><th>Źródło</th><th></th></tr></thead>
            <tbody>{rules.map((r: any) => (
              <tr key={r.id}>
                <td className="num muted">{r.prio}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pattern}</td>
                <td>{r.category_id}</td>
                <td>{r.is_business === null ? <span className="muted">wg konta</span> : r.is_business ? <span className="chip b">firmowe</span> : <span className="chip">prywatne</span>}</td>
                <td className="num">{r.hits}</td>
                <td><span className="chip">{r.origin}</span></td>
                <td>{r.origin === 'user' && <button className="btn ghost" style={{ padding: '2px 7px' }}
                  onClick={async () => { await del(`/api/rules/${r.id}`); load(); }}>×</button>}</td>
              </tr>
            ))}</tbody></table>
        </div>
      </Card>
    </>
  );
}
