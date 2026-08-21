import React, { useEffect, useState } from 'react';
import { Card, Empty, Tile, Money } from '../ui';
import Przeplyw from '../Przeplyw';
import { get, post, pln, pln2, MONTH_LABEL } from '../api';

const PARAMS = [
  ['zus_monthly', 'ZUS / mies.'],
  ['pit_rate_of_net', 'Stawka PIT-28 (ułamek netto)'],
  ['subkonto_other_monthly', 'Subkonto — inne stałe'],
  ['company_costs_monthly', 'Koszty firmowe z rachunku bieżącego'],
  ['household_monthly', 'ING — gospodarstwo (stały)'],
  ['household_adhoc_monthly', 'Gospodarstwo — przelewy doraźne'],
  ['travel_goal_monthly', 'Cel na wyjazdy / mies.'],
  ['mbank_monthly', 'mBank — codzienne'],
  ['pko_monthly', 'PKO — wydatki własne'],
];

const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  const t = y * 12 + mm;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export default function PlanWyplaty({ months }: any) {
  const [base, setBase] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('');
  const [ov, setOv] = useState<any>({});
  const [bonus, setBonus] = useState('');
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    get('/api/payout/defaults').then((d) => {
      setBase(d);
      setAmount(String(d.last_invoice?.amount ?? ''));
      setMonth(d.reserve?.plan_month || '');
    });
  }, []);

  useEffect(() => {
    if (!amount || !month) return;
    post('/api/payout/plan', {
      amount: Number(amount), planMonth: month, overrides: ov, bonusNet: Number(bonus) || 0,
    }).then(setPlan);
  }, [amount, month, bonus, JSON.stringify(ov)]);

  if (!base) return <Empty>Ładowanie…</Empty>;
  const p = plan;
  const monthOpts = [...(months || [])].slice(-3).concat([nextMonth((months || []).slice(-1)[0] || '2026-08')]);

  const Step = ({ n, title, amount: a, tone, children }: any) => (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: '0 0 26px', height: 26, borderRadius: 13, background: 'var(--surface-2)',
                    display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <strong>{title}</strong>
          <strong className={tone} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{pln2(a)}</strong>
        </div>
        {children && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{children}</div>}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Plan wypłaty</h1>
          <p>Wpisz kwotę, która wpłynęła na konto firmowe. Aplikacja rozpisze, ile przelać na subkonto podatkowe, ile zostawić w firmie i jak podzielić resztę między ING, mBank i oszczędności na PKO.</p></div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              Kwota z faktury (brutto)
            </div>
            <input type="number" step="0.01" value={amount} onChange={(e: any) => setAmount(e.target.value)}
                   style={{ width: 170, fontSize: 20, fontWeight: 600, padding: '8px 10px' }} />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              Premia netto (opcjonalnie)
            </div>
            <input type="number" step="0.01" value={bonus} placeholder="0"
                   onChange={(e: any) => setBonus(e.target.value)}
                   style={{ width: 140, fontSize: 20, padding: '8px 10px' }} />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              Miesiąc
            </div>
            <select value={month} onChange={(e: any) => setMonth(e.target.value)} style={{ padding: '9px 10px' }}>
              {monthOpts.map((m: any) => <option key={m} value={m}>{MONTH_LABEL(m)}</option>)}
            </select>
          </div>
          <button className="btn" style={{ padding: '11px 20px', fontSize: 15 }}
                  onClick={() => setAmount(String(base.last_invoice?.amount ?? amount))}>
            Przyszedł przelew — rozpisz
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Wpisz kwotę, która wpłynęła na konto firmowe. Rozpis przelicza się od razu.
          {base.last_invoice && <> Ostatnia faktura: <strong>{pln2(base.last_invoice.amount)}</strong> ({base.last_invoice.booked_on}).</>}
        </p>
      </Card>

      {!p ? <Empty>Podaj kwotę.</Empty> : (
        <>
          <Przeplyw p={p} />

          <div className="grid g4" style={{ marginBottom: 12 }}>
            <Tile label="Zostaje na PKO w tym miesiącu" tone={p.private.savings >= 0 ? 'pos' : 'neg'}
                  value={pln(p.private.savings)}
                  sub={p.subkonto.catch_up > 0 ? `w tym efekt nadrobienia zaległości` : 'po stałych przelewach'} />
            <Tile label="Docelowo co miesiąc" value={pln(p.steady.savings)}
                  sub="gdy rezerwa podatkowa jest dokładnie opłacona" />
            <Tile label="Średni odpływ z PKO" value={pln(p.steady.pko_outflow)}
                  sub={`większe wydatki ${pln(p.steady.pko_spend)} + wyjazdy ${pln(p.steady.travel_monthly)}`} />
            <Tile label="Realny przyrost oszczędności" tone={p.steady.net_accumulation >= 0 ? 'pos' : 'neg'}
                  value={pln(p.steady.net_accumulation)} sub="docelowo, po odjęciu odpływu z PKO" />
          </div>

          {p.reserves?.items?.length > 0 && (
            <Card title="Rezerwy na wydatki cykliczne wliczone w plan" style={{ marginBottom: 12 }}>
              <div className="scroll"><table>
                <thead><tr><th>Pozycja</th><th className="num">Kwota</th><th>Cykl</th><th className="num">Odkładasz / mies.</th>
                  <th>Najbliższa płatność</th><th>Doliczone do</th></tr></thead>
                <tbody>{p.reserves.items.map((i: any) => (
                  <tr key={i.id}><td><strong>{i.name}</strong></td><td className="num">{pln2(i.amount)}</td>
                    <td><span className="chip">co {i.period_months} mies.</span></td>
                    <td className="num"><strong>{pln2(i.monthly)}</strong></td>
                    <td>{MONTH_LABEL(i.next_due_month)}</td>
                    <td><span className="chip">{i.target}</span></td></tr>
                ))}</tbody>
              </table></div>
            </Card>
          )}

          {p.reserve.accrual_schedule?.items?.length > 0 && (
            <Card title="Harmonogram zobowiązań z terminem płatności" style={{ marginBottom: 12 }}>
              <div className="scroll"><table>
                <thead><tr><th>Pozycja</th><th>Termin</th><th className="num">Do uzbierania</th>
                  <th className="num">Rata / mies.</th><th className="num">Rat wpłaconych</th><th className="num">Powinno już leżeć</th></tr></thead>
                <tbody>{p.reserve.accrual_schedule.items.map((i: any) => (
                  <tr key={i.name}>
                    <td><strong>{i.name}</strong></td>
                    <td>{i.due_month ? MONTH_LABEL(i.due_month) : <span className="warnc">brak terminu — wymagane w całości</span>}</td>
                    <td className="num">{pln2(i.total_at_due)}</td>
                    <td className="num"><strong>{i.instalment ? pln2(i.instalment) : '—'}</strong></td>
                    <td className="num muted">{i.instalments ? `${i.instalments_done} / ${i.instalments}` : '—'}</td>
                    <td className="num warnc">{pln2(i.required_so_far)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                Zobowiązanie rośnie aż do miesiąca zapłaty, więc „do uzbierania” jest wyższe niż to, co narosło do dziś.
                Rata to ta kwota rozłożona równo na miesiące od rozpoczęcia odkładania do terminu.
              </p>
            </Card>
          )}

          <div className="grid g2" style={{ marginBottom: 12 }}>
            <Card title="Kolejność przelewów">
              <Step n="1" title="Konto firmowe → subkonto podatkowe" amount={p.subkonto.total} tone="warnc">
                Po tym przelewie subkonto pokrywa dokładnie to, co jesteś winien: VAT za {p.reserve.quarter},
                PIT-28 i ZUS za ten miesiąc oraz {pln(p.reserve.accrued_liabilities)} niezafakturowanych zobowiązań.
              </Step>
              <Step n="2" title="Zostaw na koncie firmowym" amount={p.company.keep}>
                Mediana kosztów firmowych opłacanych bezpośrednio z rachunku bieżącego (paliwo, narzędzia, usługi).
                Docelowy bufor: {pln(p.company.buffer_target)}.
              </Step>
              <Step n="3" title="Konto firmowe → PKO prywatne" amount={p.private.total}>
                Cała reszta. PKO jest hubem prywatnym — stąd zasilasz ING i mBank i tu trzymasz zapas.
              </Step>
              <Step n="4" title="PKO → ING (gospodarstwo)" amount={p.private.ing}>
                Bieżące życie, gaz, prąd i rata hipoteki dla żony.
              </Step>
              <Step n="5" title="Konto główne → gospodarstwo (doraźne)" amount={p.private.adhoc}>
                Nieregularne — w danych pojawiły się w 6 z 12 miesięcy. Kwota to średnia rozłożona na wszystkie miesiące.
              </Step>
              <Step n="6" title="PKO → mBank (codzienne wydatki)" amount={p.private.mbank}>
                Suma kategorii przypisanych do mBanku w zakładce <strong>Struktura kont</strong> — bez wyjazdów, te idą z oszczędności.
              </Step>
              <Step n="7" title="Zostaw na PKO na własne wydatki" amount={p.private.pko_spend}>
                Suma kategorii przypisanych do PKO: przedszkole, zdrowie, ubrania, dom, ubezpieczenia.
              </Step>
              <Step n="8" title="Zostaje jako oszczędności" amount={p.private.savings}
                    tone={p.private.savings >= 0 ? 'pos' : 'neg'}>
                {p.private.savings < 0
                  ? 'Ujemne — w tym miesiącu nie odłożysz nic i musisz sięgnąć do zapasu.'
                  : 'Z tego finansujesz wyjazdy; reszta zostaje jako realny przyrost.'}
              </Step>
            </Card>

            <div>
              <Card title="Co składa się na przelew na subkonto" style={{ marginBottom: 12 }}>
                <table><tbody>
                  {p.subkonto.lines.map((l: any) => (
                    <tr key={l.label}><td>{l.label}</td><td className="num">{pln2(l.value)}</td></tr>
                  ))}
                  <tr><td><strong>Prowizja powtarzalna</strong></td><td className="num"><strong>{pln2(p.subkonto.provision)}</strong></td></tr>
                  {p.subkonto.catch_up > 0 && (
                    <tr><td className="warnc">Nadrobienie zaległości (jednorazowo)</td><td className="num warnc">{pln2(p.subkonto.catch_up)}</td></tr>
                  )}
                  <tr><td><strong>Razem do przelania</strong></td><td className="num"><strong>{pln2(p.subkonto.total)}</strong></td></tr>
                </tbody></table>
              </Card>

              <Card title="Ile z tego naprawdę zostaje">
                <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
                  Na PKO zostaje wszystko, czego nie wysłałeś dalej — i to jest Twój stan oszczędności.
                  Z tego samego salda schodzą jednak większe, nieregularne wydatki i wyjazdy.
                </p>
                <table><tbody>
                  <tr><td>Zostaje na PKO docelowo / mies.</td><td className="num">{pln2(p.steady.savings)}</td></tr>
                  <tr><td className="muted" style={{ paddingLeft: 16 }}>większe i losowe wydatki</td>
                      <td className="num neg">−{pln2(p.steady.pko_spend)}</td></tr>
                  <tr><td className="muted" style={{ paddingLeft: 16 }}>wyjazdy</td>
                      <td className="num neg">−{pln2(p.steady.travel_monthly)}</td></tr>
                  <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                      <td><strong>Realny przyrost oszczędności</strong></td>
                      <td className="num"><strong className={p.steady.net_accumulation >= 0 ? 'pos' : 'neg'}>
                        {pln2(p.steady.net_accumulation)}</strong></td></tr>
                </tbody></table>
                {p.steady.net_accumulation < 0 && (
                  <p className="warnc" style={{ fontSize: 12.5, marginBottom: 0 }}>
                    Saldo PKO będzie się kurczyć o {pln(Math.abs(p.steady.net_accumulation))} miesięcznie.
                    Żeby rosło, wyjazdy musiałyby zejść poniżej {pln(Math.max(0, p.steady.savings - p.steady.pko_spend))}/mies.
                  </p>
                )}
              </Card>
            </div>
          </div>

          <Card title="Parametry planu (wyliczone z historii — możesz nadpisać)">
            <div className="grid g4">
              {PARAMS.map(([k, label]) => (
                <label key={k} style={{ fontSize: 12.5 }}>
                  <div className="muted" style={{ marginBottom: 3 }}>{label}</div>
                  <input type="number" step="any" style={{ width: '100%' }}
                    value={ov[k] ?? base.defaults[k]}
                    onChange={(e: any) => setOv({ ...ov, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
              ))}
            </div>
            {Object.keys(ov).length > 0 && (
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setOv({})}>Przywróć wartości z historii</button>
            )}
          </Card>
        </>
      )}
    </>
  );
}
