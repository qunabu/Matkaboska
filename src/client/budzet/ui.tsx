import React from 'react';
import { pln, pct } from './api.js';

export const Card = ({ title, children, style, actions }: any) => (
  <div className="card" style={style}>
    {(title || actions) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title && <h3 style={{ marginBottom: 12 }}>{title}</h3>}
        {actions}
      </div>
    )}
    {children}
  </div>
);

export const Tile = ({ label, value, sub, tone, hero }: any) => (
  <div className={`card tile${hero ? ' hero' : ''}`}>
    <div className="label">{label}</div>
    <div className={`value ${tone || ''}`}>{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

export const Money = ({ v, signed }: any) => (
  <span className={v > 0 ? (signed ? 'pos' : '') : v < 0 ? (signed ? 'neg' : '') : 'muted'}>
    {signed && v > 0 ? '+' : ''}{pln(v)}
  </span>
);

export const Bar = ({ value, max, color }: any) => (
  <div className="bar-track">
    <div className="bar-fill" style={{ width: `${Math.min(100, (value / (max || 1)) * 100)}%`, background: color || 'var(--series-1)' }} />
  </div>
);

export const Legend = ({ items }: any) => (
  <div className="legend">
    {items.map((i: any) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}
  </div>
);

export const Empty = ({ children }: any) => <div className="muted" style={{ padding: '26px 0', textAlign: 'center' }}>{children}</div>;

export function Tooltip({ active, payload, label, fmt = pln, labelFmt = (l: any) => l }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{labelFmt(label)}</div>
      {payload.filter((p: any) => p.value).map((p: any) => (
        <div className="r" key={p.dataKey}>
          <span><i style={{ display:'inline-block', width:8, height:8, borderRadius:2, background: p.color, marginRight:6 }} />{p.name}</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}
