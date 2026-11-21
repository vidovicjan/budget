import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { money, moneyAxis, moneyWhole } from '../lib/format';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean, round axis ticks from 0 up to (at least) max. */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 100, 200, 300, 400];
  const raw = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const count = Math.max(1, Math.ceil(max / step - 1e-9));
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/** Column with a 4px rounded data end, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

interface TipProps {
  x: number;
  y: number;
  /** Place to the left of x instead of the right. */
  flip: boolean;
  children: ReactNode;
}

function Tip({ x, y, flip, children }: TipProps) {
  return (
    <div className="tooltip" style={{ left: x, top: y, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
      {children}
    </div>
  );
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="tt-row">
      {color && <span className="swatch" style={{ background: color }} />}
      <span>{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- grouped columns

export interface Series {
  name: string;
  color: string;
}

export interface GroupRow {
  label: string;
  title: string;
  values: number[];
}

export function GroupedColumns({
  rows,
  series,
  height = 300,
  title,
  extra,
}: {
  rows: GroupRow[];
  series: Series[];
  height?: number;
  title: string;
  extra?: (row: GroupRow) => ReactNode;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 64, r: 4, t: 12, b: 30 };
  const pw = Math.max(0, w - m.l - m.r);
  const ph = height - m.t - m.b;
  const max = Math.max(0, ...rows.flatMap((r) => r.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => m.t + ph * (1 - v / top);
  const band = rows.length ? pw / rows.length : 0;
  const k = series.length;
  const gap = 2;
  const bw = Math.max(3, Math.min(18, (band * 0.62 - gap * (k - 1)) / k));
  const gw = bw * k + gap * (k - 1);

  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={height} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'baseline' : 'grid'} />
              <text x={m.l - 10} y={y(t)} dy="0.32em" textAnchor="end" className="axis">
                {moneyAxis(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const x0 = m.l + i * band;
            const gx = x0 + (band - gw) / 2;
            return (
              <g key={r.title}>
                {hover === i && <rect x={x0 + 2} y={m.t} width={band - 4} height={ph} rx={6} className="hover-band" />}
                {r.values.map((v, j) => {
                  const h = (ph * v) / top;
                  return h >= 0.5 ? <path key={j} d={columnPath(gx + j * (bw + gap), y(v), bw, h)} fill={series[j].color} /> : null;
                })}
                <text x={x0 + band / 2} y={height - 10} textAnchor="middle" className="axis">
                  {r.label}
                </text>
                <rect x={x0} y={m.t} width={band} height={ph + m.b} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && rows[hover] && (
        <Tip x={m.l + hover * band + band / 2 + (hover > rows.length / 2 ? -gw / 2 : gw / 2)} y={m.t} flip={hover > rows.length / 2}>
          <div className="tt-title">{rows[hover].title}</div>
          {series.map((s, j) => (
            <TipRow key={s.name} color={s.color} label={s.name} value={money(rows[hover].values[j])} />
          ))}
          {extra?.(rows[hover])}
        </Tip>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th scope="col" key={s.name}>
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.title}>
              <th scope="row">{r.title}</th>
              {r.values.map((v, j) => (
                <td key={j}>{money(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- donut

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  size = 184,
  thickness = 24,
  centerLabel,
  active,
  onActive,
  format,
}: {
  slices: Slice[];
  /** Formats amounts; defaults to the app currency. */
  format?: (n: number) => string;
  size?: number;
  thickness?: number;
  centerLabel: string;
  active: string | null;
  onActive: (key: string | null) => void;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const fmt = format ?? money;
  const fmtWhole = format ? (n: number) => format(n).replace(/.dd$/, '') : moneyWhole;
  const R = size / 2;
  const r = R - thickness;
  const c = size / 2;
  const pt = (rad: number, a: number) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
  const shown = slices.filter((s) => s.value > 0);
  const hovered = shown.find((s) => s.key === active);

  let a = -Math.PI / 2;
  const arcs = shown.map((s) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = a;
    const a1 = a + sweep;
    a = a1;
    // 2px surface gap between neighbours
    const po = shown.length > 1 ? 1 / R : 0;
    const pi = shown.length > 1 ? 1 / r : 0;
    const large = sweep - 2 * po > Math.PI ? 1 : 0;
    const d =
      shown.length === 1
        ? ''
        : `M${pt(R, a0 + po)}A${R},${R} 0 ${large} 1 ${pt(R, a1 - po)}L${pt(r, a1 - pi)}A${r},${r} 0 ${large} 0 ${pt(r, a0 + pi)}Z`;
    return { s, d };
  });

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} role="img" aria-label={`${centerLabel}: ${fmt(total)}`} onMouseLeave={() => onActive(null)}>
        {shown.length === 0 && <circle cx={c} cy={c} r={R - thickness / 2} fill="none" stroke="var(--grid)" strokeWidth={thickness} />}
        {shown.length === 1 && (
          <circle
            cx={c}
            cy={c}
            r={R - thickness / 2}
            fill="none"
            stroke={shown[0].color}
            strokeWidth={thickness}
            onMouseEnter={() => onActive(shown[0].key)}
          />
        )}
        {arcs.map(({ s, d }) =>
          d ? (
            <path
              key={s.key}
              d={d}
              fill={s.color}
              opacity={active && active !== s.key ? 0.35 : 1}
              onMouseEnter={() => onActive(s.key)}
              style={{ transition: 'opacity 120ms' }}
            />
          ) : null
        )}
        <text x={c} y={c - 10} textAnchor="middle" className="donut-label">
          {hovered ? hovered.label : centerLabel}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" className="donut-center" fontSize={hovered ? 17 : 19}>
          {hovered ? fmt(hovered.value) : fmtWhole(total)}
        </text>
        {hovered && (
          <text x={c} y={c + 32} textAnchor="middle" className="donut-label">
            {Math.round((hovered.value / total) * 100)}%
          </text>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- budget vs actual

export interface BudgetBar {
  key: string;
  label: string;
  limit: number;
  spent: number;
}

export function BudgetBars({ rows }: { rows: BudgetBar[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.limit, r.spent)));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="hbars" onMouseLeave={() => setHover(null)}>
      {rows.map((r) => {
        const over = r.limit > 0 && r.spent > r.limit;
        const within = r.limit > 0 ? Math.min(r.spent, r.limit) : r.spent;
        return (
          <div className="hbar" key={r.key} onMouseEnter={() => setHover(r.key)}>
            <span className="name">{r.label}</span>
            <div className="track" aria-hidden="true">
              {r.limit > 0 && <span className="limit" style={{ width: pct(r.limit) }} />}
              <span
                className="spent"
                style={{ width: pct(within), borderRadius: over ? '4px 0 0 4px' : undefined, opacity: hover && hover !== r.key ? 0.45 : 1 }}
              />
              {over && <span className="overpart" style={{ left: `calc(${pct(r.limit)} + 2px)`, width: `calc(${pct(r.spent - r.limit)} - 2px)` }} />}
            </div>
            <span className="val">
              <strong>{moneyWhole(r.spent)}</strong> / {r.limit > 0 ? moneyWhole(r.limit) : 'no limit'}
            </span>
            {hover === r.key && (
              <div className="tooltip" style={{ left: 124, bottom: 'calc(100% + 6px)' }}>
                <div className="tt-title">{r.label}</div>
                <TipRow color="var(--series-ink)" label="Spent" value={money(r.spent)} />
                <TipRow color="var(--limit)" label="Limit" value={r.limit > 0 ? money(r.limit) : '—'} />
                {r.limit > 0 && <TipRow label={over ? 'Over by' : 'Left'} value={money(Math.abs(r.limit - r.spent))} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- daily area

export function DailyArea({
  values,
  days,
  dayLabel,
  height = 220,
  color = '#E86F56',
}: {
  /** values[i] = amount on day i + 1, only for days that have happened. */
  values: number[];
  days: number;
  dayLabel: (day: number) => string;
  height?: number;
  color?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 56, r: 12, t: 12, b: 28 };
  const pw = Math.max(0, w - m.l - m.r);
  const ph = height - m.t - m.b;
  const ticks = niceTicks(Math.max(0, ...values), 3);
  const top = ticks[ticks.length - 1];
  const x = (i: number) => m.l + (days <= 1 ? 0 : (pw * i) / (days - 1));
  const y = (v: number) => m.t + ph * (1 - v / top);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = values.length ? `${line}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';
  const labelDays = [1, 8, 15, 22, days].filter((d, i, a) => a.indexOf(d) === i && d <= days);

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    if (!values.length) return;
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * (days - 1));
    setHover(Math.max(0, Math.min(values.length - 1, i)));
  };

  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={height} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'baseline' : 'grid'} />
              <text x={m.l - 10} y={y(t)} dy="0.32em" textAnchor="end" className="axis">
                {moneyAxis(t)}
              </text>
            </g>
          ))}
          {labelDays.map((d) => (
            <text key={d} x={x(d - 1)} y={height - 8} textAnchor="middle" className="axis">
              {dayLabel(d)}
            </text>
          ))}
          {area && <path d={area} fill={color} fillOpacity={0.1} />}
          {line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={y(0)} stroke="var(--input-border)" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(values[hover])} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          <rect x={m.l} y={m.t} width={pw} height={ph} fill="transparent" onMouseMove={onMove} />
        </svg>
      )}
      {hover !== null && (
        <Tip x={x(hover)} y={m.t} flip={hover > days / 2}>
          <div className="tt-title">{dayLabel(hover + 1)}</div>
          <TipRow color={color} label="Spent" value={money(values[hover])} />
        </Tip>
      )}
    </div>
  );
}
