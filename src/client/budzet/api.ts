const BASE = '/api/budzet'

const j = async (url: string, opts?: RequestInit) => {
  const r = await fetch(url.startsWith('/api') ? url.replace('/api', BASE) : url, opts);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || r.statusText);
  return r.json();
};
export const get = (u: string) => j(u);
export const post = (u: string, body: unknown) => j(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const patch = (u: string, body: unknown) => j(u, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const put = (u: string, body: unknown) => j(u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const del = (u: string) => j(u, { method: 'DELETE' });

export const plnFmt = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
export const plnFmt2 = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 2 });
export const numFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
export const pln = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : plnFmt.format(n));
export const pln2 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : plnFmt2.format(n));
export const pct = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : `${n.toFixed(1)}%`);
export const MONTH_LABEL = (m?: string) => {
  if (!m) return '';
  const [y, mm] = m.split('-');
  return `${['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'][+mm - 1]} ${y.slice(2)}`;
};
export const SERIES = ['var(--series-1)','var(--series-2)','var(--series-3)','var(--series-4)',
                       'var(--series-5)','var(--series-6)','var(--series-7)','var(--series-8)'];
