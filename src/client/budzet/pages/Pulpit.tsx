import React from 'react';
import { BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RT, Cell, ReferenceLine, ComposedChart, Line } from 'recharts';
import { Card, Tile, Money, Tooltip, Legend, Empty } from '../ui';
import { pln, pct, MONTH_LABEL } from '../api';

const axis = { stroke: 'var(--text-muted)', fontSize: 11 };

export default function Pulpit({ data }: any) {
  if (!data) return <Empty>Ładowanie…</Empty>;
  const { waterfall, ratios, safe_to_save, emergency, coverage, complete_months,
          accruals = [], outstanding_accruals } = data;
  const openAccruals = accruals.filter((a: any) => !a.settled);
  const full = waterfall.filter((w: any) => complete_months.includes(w.month));
  const last = full[full.length - 1];

  // Kaskada dla ostatniego pełnego miesiąca: od przychodu netto do nadwyżki.
  const steps = last ? [
    { name: 'Przychód netto', v: last.netto, kind: 'in' },
    { name: 'ZUS', v: -last.zus, kind: 'out' },
    { name: 'PIT-28', v: -last.pit, kind: 'out' },
    { name: 'Koszty firmy', v: -last.koszty_firmowe, kind: 'out' },
    { name: 'Wydatki prywatne', v: -last.wydatki_prywatne, kind: 'out' },
    { name: 'Gospodarstwo', v: -last.transfer_gospod, kind: 'out' },
    { name: 'Nadwyżka', v: last.nadwyzka, kind: 'end' },
  ] : [];
  let run = 0;
  const wf = steps.map((s: any) => {
    if (s.kind === 'in') { run = s.v; return { ...s, base: 0, span: s.v }; }
    if (s.kind === 'end') return { ...s, base: 0, span: s.v };
    const base = run + s.v; const span = -s.v; run = base;
    return { ...s, base, span };
  });

  const surplus = waterfall.map((w: any) => ({ ...w, label: MONTH_LABEL(w.month), partial: !complete_months.includes(w.month) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pulpit</h1>
          <p>Ile realnie zostaje po podatkach, kosztach firmy i życiu. Miesiące brzegowe ({waterfall[0]?.month}, {waterfall[waterfall.length-1]?.month}) są niepełne i nie wchodzą do średnich.</p>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        <Tile hero label="Nadwyżka / mies. (po zobowiązaniach)"
              tone={ratios?.avg_nadwyzka_skorygowana >= 0 ? 'pos' : 'neg'}
              value={pln(ratios?.avg_nadwyzka_skorygowana)}
              sub={`kasowo ${pln(ratios?.avg_nadwyzka)} · stopa ${pct(ratios?.stopa_oszczedzania_skorygowana)} · ${ratios?.months_analysed} pełnych mies.`} />
        <Tile label="Przychód netto (bez VAT)" value={pln(ratios?.avg_netto)}
              sub={`brutto ${pln(ratios?.avg_brutto)} · VAT 23% jest przepływowy`} />
        <Tile label="Efektywne obciążenie" value={pct(ratios?.efektywna_stopa_podatkowa)}
              sub="VAT + PIT-28 + ZUS względem brutto" />
        <Tile label="Zobowiązania niezapłacone" tone={outstanding_accruals?.total > 0 ? 'warnc' : ''}
              value={pln(outstanding_accruals?.total)}
              sub={openAccruals.map((a: any) => `${a.name}: ${a.months_accrued} mies.`).join(' · ') || 'brak'} />
      </div>

      <div className="grid g2" style={{ marginBottom: 12 }}>
        <Card title={`Kaskada — ${last ? MONTH_LABEL(last.month) : ''} (ostatni pełny miesiąc)`}>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={wf} margin={{ top: 6, right: 8, left: 4, bottom: 40 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="name" {...axis} angle={-32} textAnchor="end" interval={0} height={64} tickLine={false} />
                <YAxis {...axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={44} />
                <RT content={<Tooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                <RBar dataKey="base" stackId="a" fill="transparent" />
                <RBar dataKey="span" stackId="a" radius={[4, 4, 0, 0]} name="Kwota">
                  {wf.map((s: any, i: number) => (
                    <Cell key={i} fill={s.kind === 'in' ? 'var(--series-1)' : s.kind === 'end'
                      ? (s.v >= 0 ? 'var(--series-3)' : 'var(--series-8)') : 'var(--series-2)'} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{label:'Przychód netto',color:'var(--series-1)'},{label:'Odpływy',color:'var(--series-2)'},{label:'Nadwyżka',color:'var(--series-3)'}]} />
        </Card>

        <Card title="Nadwyżka miesięczna">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={surplus} margin={{ top: 6, right: 8, left: 4, bottom: 20 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" {...axis} tickLine={false} interval={0} angle={-40} textAnchor="end" height={48} />
                <YAxis {...axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={44} />
                <RT content={<Tooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                <ReferenceLine y={0} stroke="var(--border-strong)" />
                <RBar dataKey="nadwyzka" name="Nadwyżka" radius={[4, 4, 0, 0]}>
                  {surplus.map((s: any, i: number) => (
                    <Cell key={i} fill={s.partial ? 'var(--border-strong)' : s.nadwyzka >= 0 ? 'var(--series-3)' : 'var(--series-8)'} />
                  ))}
                </RBar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{label:'Dodatnia',color:'var(--series-3)'},{label:'Ujemna',color:'var(--series-8)'},{label:'Miesiąc niepełny',color:'var(--border-strong)'}]} />
        </Card>
      </div>

      {outstanding_accruals?.before_data > 0 && (
        <div className="note" style={{ borderLeftColor: 'var(--warn)' }}>
          <strong>{pln(outstanding_accruals.before_data)}</strong> z niezapłaconych zobowiązań narosło
          <strong> przed {outstanding_accruals.first_month}</strong>, czyli przed pierwszym wyciągiem.
          Tej części nie widać w żadnym miesiącu kaskady — jest doliczona tylko do sumy zobowiązań
          i do kwoty możliwej do odłożenia.
        </div>
      )}

      <div className="grid g2" style={{ marginBottom: 12 }}>
        <Card title="Ile mogę odłożyć">
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            Cel: trzymać na koncie firmowym tylko bufor roboczy, resztę przenosić na oszczędności.
          </p>
          <table>
            <tbody>
              <tr><td>Średnia nadwyżka kasowa</td><td className="num"><Money v={safe_to_save?.avg_monthly_surplus} signed /></td></tr>
              <tr><td>Po odjęciu narastających zobowiązań</td><td className="num"><Money v={safe_to_save?.avg_monthly_surplus_adjusted} signed /></td></tr>
              <tr><td>Docelowy bufor firmowy</td><td className="num">{pln(safe_to_save?.buffer_target)}</td></tr>
              <tr><td>Saldo konta firmowego</td><td className="num">{safe_to_save?.company_balance == null ? <span className="muted">podaj w Majątku</span> : pln(safe_to_save.company_balance)}</td></tr>
              <tr><td>Zobowiązania do zapłaty<div className="muted" style={{fontSize:11}}>zarezerwowane, nie do odłożenia</div></td><td className="num warnc">−{pln(safe_to_save?.outstanding_accruals)}</td></tr>
              <tr><td><strong>Do przeniesienia teraz</strong></td><td className="num"><strong>{safe_to_save?.transferable_now == null ? '—' : pln(safe_to_save.transferable_now)}</strong></td></tr>
              <tr><td><strong>Zalecany stały przelew / mies.</strong></td><td className="num"><strong className={safe_to_save?.recommended_monthly_transfer > 0 ? 'pos' : ''}>{pln(safe_to_save?.recommended_monthly_transfer)}</strong></td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="Poduszka finansowa">
          <table>
            <tbody>
              <tr><td>Pełny koszt miesięczny (z ZUS, PIT i firmą)<div className="muted" style={{fontSize:11}}>tyle musisz pokryć, żeby firma i dom działały bez przychodu</div></td><td className="num">{pln(emergency?.monthly_baseline)}</td></tr>
              <tr><td>Sam koszt życia (bez wyjazdów)<div className="muted" style={{fontSize:11}}>wydatki prywatne + transfer do gospodarstwa</div></td><td className="num muted">{pln(emergency?.monthly_baseline_lifestyle_only)}</td></tr>
              <tr><td>Cel: {emergency?.target_months} miesięcy</td><td className="num">{pln(emergency?.target_amount)}</td></tr>
              <tr><td>Dostępna gotówka</td><td className="num">{emergency?.current_liquid ? pln(emergency.current_liquid) : <span className="muted">podaj salda kont</span>}</td></tr>
              <tr><td>Miesięcy przetrwania</td><td className="num">{emergency?.months_of_runway ? emergency.months_of_runway.toFixed(1) : '—'}</td></tr>
              <tr><td><strong>Brakuje</strong></td><td className="num"><strong className={emergency?.gap > 0 ? 'warnc' : 'pos'}>{pln(emergency?.gap)}</strong></td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Miesiąc po miesiącu">
        <div className="scroll">
          <table>
            <thead><tr>
              <th>Miesiąc</th><th className="num">Brutto</th><th className="num">VAT</th><th className="num">Netto</th>
              <th className="num">ZUS</th><th className="num">PIT-28</th><th className="num">Koszty firmy</th>
              <th className="num">Wydatki prywatne</th><th className="num">Gospodarstwo</th><th className="num">Nadwyżka</th>
              <th className="num">Zobow.</th><th className="num">Po korekcie</th>
            </tr></thead>
            <tbody>
              {waterfall.map((w: any) => {
                const partial = !complete_months.includes(w.month);
                return (
                  <tr key={w.month} style={partial ? { opacity: .55 } : undefined}>
                    <td>{MONTH_LABEL(w.month)} {partial && <span className="chip">niepełny</span>}</td>
                    <td className="num">{pln(w.brutto)}</td>
                    <td className="num muted">{pln(w.vat_nalezny)}</td>
                    <td className="num">{pln(w.netto)}</td>
                    <td className="num">{pln(w.zus)}</td>
                    <td className="num">{pln(w.pit)}</td>
                    <td className="num">{pln(w.koszty_firmowe)}</td>
                    <td className="num">{pln(w.wydatki_prywatne)}</td>
                    <td className="num">{pln(w.transfer_gospod)}{w.zwrot_gospod > 0 && <div className="muted" style={{fontSize:11}}>zwrot {pln(w.zwrot_gospod)}</div>}</td>
                    <td className="num"><Money v={w.nadwyzka} signed /></td>
                    <td className="num muted">{w.zobowiazania ? `−${pln(w.zobowiazania)}` : '—'}</td>
                    <td className="num"><Money v={w.nadwyzka_skorygowana} signed /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {coverage?.pct > 0 && (
          <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
            Nieskategoryzowane: {pln(coverage.unknown)} ({coverage.pct}% wydatków, {coverage.unknown_n} transakcji) — sprawdź zakładkę „Do sklasyfikowania”.
          </p>
        )}
      </Card>
    </>
  );
}
