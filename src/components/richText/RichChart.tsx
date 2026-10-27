import React from "react";
import { CHART_COLORS, ChartSpec, TEXT_COLOR_HEX } from "../../lib/richText";

const W = 560;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 40, left: 44 };

const colorAt = (i: number) => TEXT_COLOR_HEX[CHART_COLORS[i % CHART_COLORS.length]];

/** 1, 2, 5 × 10^n steps so the axis reads in round numbers. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  const n = max / step;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
}

const fmt = (n: number, unit = "") => `${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;

/** Bar, line and pie charts as plain SVG, drawn the same way as the website's. */
export const RichChart: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
  const { labels, series, unit = "" } = spec;
  const label = `${spec.title || "Chart"}: ${labels
    .map((l, i) => `${l} ${series.map((s) => fmt(s.values[i] ?? 0, unit)).join(" / ")}`)
    .join(", ")}`;

  return (
    <figure className="rich-chart">
      {spec.title && <figcaption className="rich-chart-title">{spec.title}</figcaption>}
      {spec.type === "pie" ? <Pie spec={spec} label={label} /> : <Axes spec={spec} label={label} />}
      {(series.length > 1 || spec.type === "pie") && (
        <ul className="rich-chart-legend">
          {(spec.type === "pie" ? labels : series.map((s) => s.name)).map((name, i) => (
            <li key={i}>
              <span style={{ background: colorAt(i) }} />
              {name}
            </li>
          ))}
        </ul>
      )}
      {spec.caption && <p className="rich-chart-caption">{spec.caption}</p>}
    </figure>
  );
};

const Axes: React.FC<{ spec: ChartSpec; label: string }> = ({ spec, label }) => {
  const { labels, series, unit = "" } = spec;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, labels.length);
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const barW = Math.min(36, (slot * 0.7) / series.length);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="rich-chart-grid" />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="rich-chart-axis">
            {fmt(t, unit)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={PAD.left + slot * (i + 0.5)} y={H - PAD.bottom + 20} textAnchor="middle" className="rich-chart-axis">
          {l}
        </text>
      ))}
      {spec.type === "bar"
        ? series.map((s, si) =>
            s.values.map((v, i) => {
              const x = PAD.left + slot * (i + 0.5) - (barW * series.length) / 2 + si * barW;
              return (
                <rect key={`${si}-${i}`} x={x + 1} y={y(v)} width={barW - 2} height={PAD.top + plotH - y(v)} rx={3} fill={colorAt(si)}>
                  <title>{`${s.name ? `${s.name} · ` : ""}${labels[i]}: ${fmt(v, unit)}`}</title>
                </rect>
              );
            })
          )
        : series.map((s, si) => {
            const points = s.values.map((v, i) => `${PAD.left + slot * (i + 0.5)},${y(v)}`);
            return (
              <g key={si}>
                <polyline points={points.join(" ")} fill="none" stroke={colorAt(si)} strokeWidth={2.5} strokeLinejoin="round" />
                {s.values.map((v, i) => (
                  <circle key={i} cx={PAD.left + slot * (i + 0.5)} cy={y(v)} r={4} fill={colorAt(si)}>
                    <title>{`${s.name ? `${s.name} · ` : ""}${labels[i]}: ${fmt(v, unit)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
    </svg>
  );
};

const Pie: React.FC<{ spec: ChartSpec; label: string }> = ({ spec, label }) => {
  const values = spec.series[0]?.values ?? [];
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0) || 1;
  const cx = W / 2;
  const cy = H / 2;
  const r = H / 2 - 12;
  const inner = r * 0.56;
  let angle = -Math.PI / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {values.map((v, i) => {
        const share = Math.max(0, v) / total;
        if (!share) return null;
        const start = angle;
        const end = (angle += share * Math.PI * 2);
        const pt = (rad: number, a: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
        const large = end - start > Math.PI ? 1 : 0;
        const d =
          share >= 0.9999
            ? `M ${pt(r, 0)} A ${r} ${r} 0 1 1 ${pt(r, Math.PI)} A ${r} ${r} 0 1 1 ${pt(r, 0)} M ${pt(inner, 0)} A ${inner} ${inner} 0 1 0 ${pt(inner, Math.PI)} A ${inner} ${inner} 0 1 0 ${pt(inner, 0)} Z`
            : `M ${pt(r, start)} A ${r} ${r} 0 ${large} 1 ${pt(r, end)} L ${pt(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${pt(inner, start)} Z`;
        return (
          <path key={i} d={d} fill={colorAt(i)} fillRule="evenodd" stroke="#fff" strokeWidth={2}>
            <title>{`${spec.labels[i]}: ${fmt(v, spec.unit)} (${Math.round(share * 100)}%)`}</title>
          </path>
        );
      })}
    </svg>
  );
};
