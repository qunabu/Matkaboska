import React, { useEffect, useState } from 'react';
import { Card, Empty, Tile } from '../ui';
import { get, post, del, patch, pln, MONTH_LABEL } from '../api';

export default function Majatek({ onChanged }: any) {
  const [nw, setNw] = useState<any>(null);
  const [acc, setAcc] = useState<any[]>([]);
  const [form, setForm] = useState({ kind: 'asset', name: '', category: '', amount: '' });
  const [acr, setAcr] = useState<any>(null);
  const [rsv, setRsv] = useState<any>(null);
  const [rf, setRf] = useState({ name: '', amount: '', period_months: '12', next_due_month: '', target: 'pekao_prywatne' });
  const [af, setAf] = useState({ name: '', start_month: '', amount_net: '', vat_rate: '0.23' });
  const load = () => { get('/api/net-worth').then(setNw); get('/api/accounts').then(setAcc); get('/api/accruals').then(setAcr); get('/api/reserves').then(setRsv); };
  useEffect(() => { load(); }, []);
  if (!nw) return <Empty>Ładowanie…</Empty>;

  const saveBalance = async (id: string, v: any) => { await patch(`/api/accounts/${id}`, { current_balance: Number(v) }); load(); onChanged?.(); };
  const add = async () => {
    if (!form.name || !form.amount) return;
    await post('/api/net-worth', { ...form, amount: Number(form.amount) });
    setForm({ kind: 'asset', name: '', category: '', amount: '' }); load(); onChanged?.();
  };

  const addAccrual = async () => {
    if (!af.name || !af.start_month || !af.amount_net) return;
    await post('/api/accruals', { ...af, amount_net: Number(af.amount_net), vat_rate: Number(af.vat_rate) });
    setAf({ name: '', start_month: '', amount_net: '', vat_rate: '0.23' }); load(); onChanged?.();
  };
  const settle = async (a: any) => { await patch(`/api/accruals/${a.id}`, { settled: !a.settled }); load(); onChanged?.(); };
  const addReserve = async (data?: any) => {
    const d = data || rf;
    if (!d.name || !d.amount || !d.next_due_month) return;
    await post('/api/reserves', { ...d, amount: Number(d.amount), period_months: Number(d.period_months) });
    setRf({ name: '', amount: '', period_months: '12', next_due_month: '', target: 'pekao_prywatne' });
    load(); onChanged?.();
  };
  const TARGET_NAMES: Record<string, string> = {
    pekao_prywatne: 'PKO prywatne', mbank_intensive: 'mBank',
    pekao_firmowe: 'Konto firmowe', pekao_subkonto: 'Subkonto',
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Majątek netto</h1>
          <p>Salda rachunków wpisz ręcznie — wyciągi CSV zawierają operacje, nie stany kont. Po ich uzupełnieniu aplikacja policzy poduszkę finansową i kwotę, którą możesz od razu przenieść na oszczędności.</p></div>
      </div>

      <div className="grid g3" style={{ marginBottom: 12 }}>
        <Tile label="Aktywa" value={pln(nw.total_assets)} />
        <Tile label="Zobowiązania" value={pln(nw.total_liabilities)} />
        <Tile hero label="Majątek netto" value={pln(nw.net_worth)} tone={nw.net_worth >= 0 ? 'pos' : 'neg'} />
      </div>

      <Card title="Salda rachunków" style={{ marginBottom: 12 }}>
        <div className="scroll"><table>
          <thead><tr><th>Rachunek</th><th>Typ</th><th className="num">Przepływ w danych</th><th className="num">Aktualne saldo</th><th></th></tr></thead>
          <tbody>{acc.map((a: any) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td><span className="chip">{a.kind}</span></td>
              <td className="num muted">{pln(a.netto)}</td>
              <td className="num"><input type="number" defaultValue={a.current_balance ?? ''} placeholder="—"
                style={{ width: 120 }} onBlur={(e: any) => e.target.value !== '' && saveBalance(a.id, e.target.value)} /></td>
              <td className="muted" style={{ fontSize: 12 }}>{a.balance_as_of || ''}</td>
            </tr>
          ))}</tbody></table></div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Wpisz saldo i kliknij poza pole, aby zapisać.</p>
      </Card>

      <Card title="Zobowiązania memoriałowe — koszty poniesione, jeszcze niezapłacone" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          Wydatki, które już Cię obciążają, choć faktura jeszcze nie przyszła. Narastają co miesiąc,
          obniżają nadwyżkę „po korekcie” na Pulpicie i pomniejszają kwotę możliwą do odłożenia.
          Gdy dostaniesz i zapłacisz fakturę — oznacz jako rozliczone.
        </p>
        <div className="toolbar">
          <input type="text" placeholder="Nazwa (np. Wynajem biura)" value={af.name} onChange={(e: any) => setAf({ ...af, name: e.target.value })} />
          <input type="text" placeholder="Od (RRRR-MM)" value={af.start_month} onChange={(e: any) => setAf({ ...af, start_month: e.target.value })} style={{ width: 130 }} />
          <input type="number" placeholder="Netto / mies." value={af.amount_net} onChange={(e: any) => setAf({ ...af, amount_net: e.target.value })} style={{ width: 120 }} />
          <input type="number" step="0.01" placeholder="VAT" value={af.vat_rate} onChange={(e: any) => setAf({ ...af, vat_rate: e.target.value })} style={{ width: 80 }} />
          <button className="btn" onClick={addAccrual}>Dodaj</button>
        </div>
        {!acr ? <Empty>Ładowanie…</Empty> : !acr.items.length ? <Empty>Brak zobowiązań.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>Pozycja</th><th>Okres</th><th className="num">Mies.</th><th className="num">Netto/mies.</th>
              <th className="num">Brutto razem</th><th className="num">VAT (odzyskiwalny)</th><th className="num">Realny koszt</th><th></th></tr></thead>
            <tbody>{acr.items.map((a: any) => (
              <tr key={a.id} style={a.settled ? { opacity: .5 } : undefined}>
                <td><strong>{a.name}</strong>{a.note && <div className="muted" style={{ fontSize: 11, maxWidth: 340 }}>{a.note}</div>}</td>
                <td className="muted">{MONTH_LABEL(a.start_month)} → {a.end_month ? MONTH_LABEL(a.end_month) : 'nadal'}</td>
                <td className="num">{a.months_accrued}</td>
                <td className="num">{pln(a.monthly_net)}<div className="muted" style={{ fontSize: 11 }}>brutto {pln(a.monthly_gross)}</div></td>
                <td className="num"><strong className={a.settled ? '' : 'warnc'}>{pln(a.total_gross)}</strong></td>
                <td className="num muted">{pln(a.total_vat)}</td>
                <td className="num">{pln(a.real_cost)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost" style={{ padding: '3px 8px' }} onClick={() => settle(a)}>
                    {a.settled ? 'Wznów' : 'Rozliczone'}</button>
                  <button className="btn ghost" style={{ padding: '3px 8px', marginLeft: 4 }}
                    onClick={async () => { await del(`/api/accruals/${a.id}`); load(); onChanged?.(); }}>×</button>
                </td>
              </tr>
            ))}</tbody></table></div>
        )}
        {acr?.outstanding?.before_data > 0 && (
          <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 10 }}>
            Z tego <strong>{pln(acr.outstanding.before_data)}</strong> narosło przed {acr.outstanding.first_month} —
            czyli przed pierwszym wyciągiem, więc nie pojawia się w żadnym miesiącu kaskady.
          </p>
        )}
      </Card>

      <Card title="Rezerwy na wydatki cykliczne" style={{ marginBottom: 12 }}
            actions={rsv?.plan?.monthly_total ? <span className="chip b">{pln(rsv.plan.monthly_total)} / mies.</span> : null}>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          Wydatki, które przychodzą raz na jakiś czas — ubezpieczenia roczne, przeglądy, półroczne zajęcia.
          Odkładasz 1/n co miesiąc, żeby w miesiącu płatności pieniądze już były. Plan wypłaty dolicza
          te raty do konta, które ma trzymać rezerwę.
        </p>
        <div className="toolbar">
          <input type="text" placeholder="Nazwa (np. OC/AC auto)" value={rf.name} onChange={(e: any) => setRf({ ...rf, name: e.target.value })} />
          <input type="number" placeholder="Kwota" value={rf.amount} onChange={(e: any) => setRf({ ...rf, amount: e.target.value })} style={{ width: 110 }} />
          <label style={{ fontSize: 12.5 }}>co&nbsp;
            <input type="number" value={rf.period_months} onChange={(e: any) => setRf({ ...rf, period_months: e.target.value })} style={{ width: 60 }} /> mies.</label>
          <input type="text" placeholder="Płatność (RRRR-MM)" value={rf.next_due_month} onChange={(e: any) => setRf({ ...rf, next_due_month: e.target.value })} style={{ width: 150 }} />
          <select value={rf.target} onChange={(e: any) => setRf({ ...rf, target: e.target.value })}>
            {Object.entries(TARGET_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn" onClick={() => addReserve()}>Dodaj</button>
        </div>

        {!rsv ? <Empty>Ładowanie…</Empty> : !rsv.plan.items.length ? (
          <Empty>Brak rezerw. Dodaj powyżej albo wybierz z podpowiedzi poniżej.</Empty>
        ) : (
          <div className="scroll"><table>
            <thead><tr><th>Pozycja</th><th>Cykl</th><th className="num">Kwota</th><th className="num">Odkładasz / mies.</th>
              <th className="num">Rocznie</th><th>Najbliższa płatność</th><th className="num">Powinno już leżeć</th><th>Konto</th><th></th></tr></thead>
            <tbody>{rsv.plan.items.map((i: any) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong></td>
                <td><span className="chip">co {i.period_months} mies.</span></td>
                <td className="num">{pln(i.amount)}</td>
                <td className="num"><strong>{pln(i.monthly)}</strong></td>
                <td className="num muted">{pln(i.annual_cost)}</td>
                <td>{MONTH_LABEL(i.next_due_month)} <span className="muted">({i.months_to_due} mies.)</span></td>
                <td className="num warnc">{pln(i.accumulated_target)}</td>
                <td><span className="chip">{TARGET_NAMES[i.target] || i.target}</span></td>
                <td><button className="btn ghost" style={{ padding: '2px 7px' }}
                      onClick={async () => { await del(`/api/reserves/${i.id}`); load(); onChanged?.(); }}>×</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}

        {rsv && (rsv.candidates.one_off.length > 0 || rsv.candidates.recurring.length > 0) && (
          <>
            <h3 style={{ marginTop: 16, marginBottom: 8 }}>Podpowiedzi z danych</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Rzadkie, większe płatności wykryte w wyciągach. Rok danych to za mało, żeby potwierdzić
              roczny cykl — sprawdź kwotę i termin, zanim dodasz.
            </p>
            <div className="scroll"><table>
              <thead><tr><th>Sprzedawca</th><th className="num">Kwota</th><th>Ostatnio</th><th></th></tr></thead>
              <tbody>{[...rsv.candidates.recurring.map((c: any) => ({ name: c.merchant, amount: c.amount, last: c.last_seen })),
                       ...rsv.candidates.one_off.map((c: any) => ({ name: c.merchant, amount: c.total, last: c.last_seen }))]
                .map((c: any) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num">{pln(c.amount)}</td>
                  <td className="muted">{c.last}</td>
                  <td><button className="btn ghost" style={{ padding: '3px 8px' }}
                        onClick={() => setRf({ name: c.name.slice(0, 40), amount: String(Math.round(c.amount)),
                                               period_months: '12', next_due_month: '', target: 'pekao_prywatne' })}>
                        Wypełnij formularz</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </Card>

      <div className="grid g2">
        <Card title="Pozycje ręczne">
          <div className="toolbar">
            <select value={form.kind} onChange={(e: any) => setForm({ ...form, kind: e.target.value })}>
              <option value="asset">Aktywo</option><option value="liability">Zobowiązanie</option>
            </select>
            <input type="text" placeholder="Nazwa (np. Mieszkanie)" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
            <input type="text" placeholder="Kategoria" value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })} style={{ width: 130 }} />
            <input type="number" placeholder="Kwota" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} style={{ width: 120 }} />
            <button className="btn" onClick={add}>Dodaj</button>
          </div>
          <table>
            <thead><tr><th>Pozycja</th><th>Kategoria</th><th className="num">Kwota</th><th></th></tr></thead>
            <tbody>
              {[...nw.assets, ...nw.liabilities].map((i: any, k: number) => (
                <tr key={k}>
                  <td>{i.name} {i.kind === 'liability' && <span className="chip r">zobowiązanie</span>}</td>
                  <td className="muted">{i.category || '—'}</td>
                  <td className="num">{pln(i.amount)}</td>
                  <td>{i.source === 'manual' && i.id && (
                    <button className="btn ghost" style={{ padding: '2px 7px' }} onClick={async () => { await del(`/api/net-worth/${i.id}`); load(); }}>×</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Co warto tu dopisać">
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 13 }}>
            <li>Saldo konta ING (gospodarstwo domowe) — jedyny duży przepływ, którego nie widać w wyciągach.</li>
            <li>Pozostały kapitał kredytu hipotecznego jako zobowiązanie.</li>
            <li>Wartość nieruchomości i samochodu.</li>
            <li>Rachunki inwestycyjne, obligacje, IKE/IKZE.</li>
            <li>Saldo karty Mastercard ME, jeśli jest niespłacone.</li>
            <li>Inne niezafakturowane koszty — dodaj je jako zobowiązania memoriałowe powyżej.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
