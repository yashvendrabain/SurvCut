"use client";

import type { ReactNode } from "react";

/**
 * think-cell-style chart renderer for a single cut's data.
 * Pure SVG, flat fills, on-chart data labels, category labels, totals — the
 * clean look of think-cell in PowerPoint. One <CutChart> switches on `type`.
 */

export type ChartType =
  | "clustered_column" | "clustered_bar"
  | "stacked_column" | "stacked_bar"
  | "pct_column" | "pct_bar"
  | "waterfall_up" | "waterfall_down"
  | "mekko_pct" | "mekko_unit"
  | "combination" | "line"
  | "stacked_area" | "pct_area"
  | "pie" | "doughnut"
  | "scatter" | "bubble";

export const CHART_GROUPS: { group: string; items: { key: ChartType; label: string }[] }[] = [
  { group: "Column / Bar", items: [
    { key: "clustered_column", label: "Clustered column" },
    { key: "clustered_bar", label: "Clustered bar" },
    { key: "stacked_column", label: "Stacked column" },
    { key: "stacked_bar", label: "Stacked bar" },
    { key: "pct_column", label: "100% column" },
    { key: "pct_bar", label: "100% bar" },
  ]},
  { group: "Waterfall", items: [
    { key: "waterfall_up", label: "Build-up waterfall" },
    { key: "waterfall_down", label: "Build-down waterfall" },
  ]},
  { group: "Mekko", items: [
    { key: "mekko_pct", label: "Mekko (% axis)" },
    { key: "mekko_unit", label: "Mekko (unit axis)" },
  ]},
  { group: "Line / Area", items: [
    { key: "line", label: "Line / profile" },
    { key: "combination", label: "Combination (bar + line)" },
    { key: "stacked_area", label: "Stacked area" },
    { key: "pct_area", label: "100% area" },
  ]},
  { group: "Circular", items: [
    { key: "pie", label: "Pie" },
    { key: "doughnut", label: "Doughnut" },
  ]},
  { group: "XY", items: [
    { key: "scatter", label: "Scatter" },
    { key: "bubble", label: "Bubble" },
  ]},
];

export interface CutRow { label: string; count: number; pct: number; }

const PALETTE = ["#CC0000", "#1F3A5F", "#6E8CA8", "#A9B8C9", "#7A7A85", "#9E2A2B", "#3F3F46", "#5B6B8C", "#C0CAD6", "#D4D4D8"];
const PRIMARY = "#1F3A5F";
const ACCENT = "#CC0000";
const INK = "#27272A";
const MUTED = "#71717A";
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const W = 620;

function fmtVal(v: number, mean: boolean) {
  if (mean) return (Math.round(v * 10) / 10).toLocaleString();
  return Math.round(v).toLocaleString();
}
function fmtPct(p: number) { return `${p >= 10 ? Math.round(p) : (Math.round(p * 10) / 10)}%`; }
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function polar(cx: number, cy: number, r: number, a: number) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

interface Props { rows: CutRow[]; type: ChartType; valueIsMean?: boolean; }

const H = 360;   // fixed landscape viewBox height; the SVG scales to fit its box

export function CutChart({ rows, type, valueIsMean = false }: Props) {
  const data = rows.map((r, i) => ({
    label: r.label,
    value: valueIsMean ? r.pct : r.count,
    pct: r.pct,
    color: PALETTE[i % PALETTE.length],
  }));
  if (!data.length) return <div className="text-sm text-ink-400 py-8 text-center">No data to chart.</div>;

  const common = { data, valueIsMean, H };

  let body: ReactNode = null;
  switch (type) {
    case "clustered_column": body = <Columns {...common} horizontal={false} />; break;
    case "clustered_bar": body = <Columns {...common} horizontal />; break;
    case "stacked_column": body = <Stacked {...common} horizontal={false} pct={false} />; break;
    case "stacked_bar": body = <Stacked {...common} horizontal pct={false} />; break;
    case "pct_column": body = <Stacked {...common} horizontal={false} pct />; break;
    case "pct_bar": body = <Stacked {...common} horizontal pct />; break;
    case "waterfall_up": body = <Waterfall {...common} down={false} />; break;
    case "waterfall_down": body = <Waterfall {...common} down />; break;
    case "mekko_pct": body = <Mekko {...common} unit={false} />; break;
    case "mekko_unit": body = <Mekko {...common} unit />; break;
    case "line": body = <LineArea {...common} mode="line" />; break;
    case "combination": body = <LineArea {...common} mode="combo" />; break;
    case "stacked_area": body = <LineArea {...common} mode="area" />; break;
    case "pct_area": body = <LineArea {...common} mode="area100" />; break;
    case "pie": body = <Pie {...common} inner={0} />; break;
    case "doughnut": body = <Pie {...common} inner={0.58} />; break;
    case "scatter": body = <Scatter {...common} bubble={false} />; break;
    case "bubble": body = <Scatter {...common} bubble />; break;
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ fontFamily: FONT, display: "block" }}
      role="img"
    >
      {body}
    </svg>
  );
}

type Datum = { label: string; value: number; pct: number; color: string };
type SubProps = { data: Datum[]; valueIsMean: boolean; H: number };

// ── Clustered columns / bars (single series, max bar highlighted red) ──
function Columns({ data, valueIsMean, H, horizontal }: SubProps & { horizontal: boolean }) {
  const maxV = Math.max(...data.map(d => d.value), 1);
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  if (horizontal) {
    const mL = 150, mR = 56, mT = 8, mB = 12;
    const bandH = (H - mT - mB) / data.length;
    const bh = Math.min(30, bandH * 0.62);
    const plotW = W - mL - mR;
    return <g>
      {data.map((d, i) => {
        const y = mT + i * bandH + (bandH - bh) / 2;
        const w = (d.value / maxV) * plotW;
        return <g key={i}>
          <text x={mL - 8} y={y + bh / 2} textAnchor="end" dominantBaseline="central" fontSize="12" fill={INK}>{trunc(d.label, 24)}</text>
          <rect x={mL} y={y} width={Math.max(w, 0)} height={bh} fill={i === maxIdx ? ACCENT : PRIMARY} />
          <text x={mL + w + 6} y={y + bh / 2} dominantBaseline="central" fontSize="12" fontWeight="600" fill={INK}>
            {fmtVal(d.value, valueIsMean)}{!valueIsMean && ` · ${fmtPct(d.pct)}`}
          </text>
        </g>;
      })}
    </g>;
  }
  const mL = 12, mR = 12, mT = 26, mB = 44;
  const bandW = (W - mL - mR) / data.length;
  const bw = Math.min(64, bandW * 0.6);
  const plotH = H - mT - mB;
  const baseY = mT + plotH;
  return <g>
    {data.map((d, i) => {
      const x = mL + i * bandW + (bandW - bw) / 2;
      const h = (d.value / maxV) * plotH;
      const y = baseY - h;
      return <g key={i}>
        <rect x={x} y={y} width={bw} height={Math.max(h, 0)} fill={i === maxIdx ? ACCENT : PRIMARY} />
        <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill={INK}>{fmtVal(d.value, valueIsMean)}</text>
        <text x={x + bw / 2} y={baseY + 14} textAnchor="middle" fontSize="11" fill={MUTED}>{trunc(d.label, 12)}</text>
        {!valueIsMean && <text x={x + bw / 2} y={baseY + 28} textAnchor="middle" fontSize="10" fill={MUTED}>{fmtPct(d.pct)}</text>}
      </g>;
    })}
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" strokeWidth="1" />
  </g>;
}

// ── Stacked / 100% (single stack of the categories) ──
function Stacked({ data, valueIsMean, H, horizontal, pct }: SubProps & { horizontal: boolean; pct: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const legend = <Legend data={data} pctMode={pct || !valueIsMean} valueIsMean={valueIsMean} total={total} />;
  if (horizontal) {
    const mL = 12, mR = 12, mT = 30, barH = 46;
    const plotW = W - mL - mR; let x = mL;
    return <g>
      {!pct && <text x={mL} y={mT - 10} fontSize="12" fontWeight="700" fill={INK}>Total {fmtVal(total, valueIsMean)}</text>}
      {data.map((d, i) => {
        const w = (d.value / total) * plotW;
        const seg = <g key={i}>
          <rect x={x} y={mT} width={Math.max(w - 1.5, 0)} height={barH} fill={d.color} />
          {w > 30 && <text x={x + w / 2} y={mT + barH / 2} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="600" fill="#fff">
            {pct ? fmtPct(d.value / total * 100) : fmtVal(d.value, valueIsMean)}</text>}
        </g>;
        x += w; return seg;
      })}
      <g transform={`translate(${mL}, ${mT + barH + 20})`}>{legend}</g>
    </g>;
  }
  const mT = 26, mB = 20, barW = 90, mL = (W - barW) / 2 - 90;
  const plotH = H - mT - mB - 16; let y = mT;
  return <g>
    {!pct && <text x={mL + barW / 2} y={mT - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>{fmtVal(total, valueIsMean)}</text>}
    {data.map((d, i) => {
      const h = (d.value / total) * plotH;
      const seg = <g key={i}>
        <rect x={mL} y={y} width={barW} height={Math.max(h - 1.5, 0)} fill={d.color} />
        {h > 16 && <text x={mL + barW / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="600" fill="#fff">
          {pct ? fmtPct(d.value / total * 100) : fmtVal(d.value, valueIsMean)}</text>}
      </g>;
      y += h; return seg;
    })}
    <g transform={`translate(${mL + barW + 24}, ${mT})`}>{legend}</g>
  </g>;
}

function Legend({ data, pctMode, valueIsMean, total }: { data: Datum[]; pctMode: boolean; valueIsMean: boolean; total: number }) {
  return <g>
    {data.map((d, i) => (
      <g key={i} transform={`translate(0, ${i * 20})`}>
        <rect x={0} y={0} width={11} height={11} fill={d.color} />
        <text x={17} y={9} fontSize="11" fill={INK}>
          {trunc(d.label, 26)} <tspan fill={MUTED}>{pctMode ? fmtPct(d.value / total * 100) : fmtVal(d.value, valueIsMean)}</tspan>
        </text>
      </g>
    ))}
  </g>;
}

// ── Waterfall (build-up / build-down): categories accumulate to a total ──
function Waterfall({ data, valueIsMean, H, down }: SubProps & { down: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const mL = 12, mR = 12, mT = 26, mB = 44;
  const n = data.length + 1;
  const bandW = (W - mL - mR) / n;
  const bw = Math.min(58, bandW * 0.62);
  const plotH = H - mT - mB;
  const baseY = mT + plotH;
  const scale = plotH / (total || 1);
  let cum = down ? total : 0;
  const bars = data.map((d, i) => {
    const start = cum;
    cum = down ? cum - d.value : cum + d.value;
    const top = Math.max(start, cum);
    const x = mL + i * bandW + (bandW - bw) / 2;
    const y = baseY - top * scale;
    const h = d.value * scale;
    return { x, y, h, d, connY: baseY - cum * scale };
  });
  const totX = mL + data.length * bandW + (bandW - bw) / 2;
  return <g>
    {bars.map((b, i) => (
      <g key={i}>
        <rect x={b.x} y={b.y} width={bw} height={Math.max(b.h, 0)} fill={b.d.color} />
        <text x={b.x + bw / 2} y={b.y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>{fmtVal(b.d.value, valueIsMean)}</text>
        <text x={b.x + bw / 2} y={baseY + 14} textAnchor="middle" fontSize="10" fill={MUTED}>{trunc(b.d.label, 11)}</text>
        {i < bars.length && <line x1={b.x + bw} y1={b.connY} x2={b.x + bandW} y2={b.connY} stroke="#B0B0B8" strokeWidth="1" strokeDasharray="3 3" />}
      </g>
    ))}
    <rect x={totX} y={baseY - total * scale} width={bw} height={total * scale} fill={ACCENT} />
    <text x={totX + bw / 2} y={baseY - total * scale - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={ACCENT}>{fmtVal(total, valueIsMean)}</text>
    <text x={totX + bw / 2} y={baseY + 14} textAnchor="middle" fontSize="10" fontWeight="600" fill={INK}>Total</text>
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" />
  </g>;
}

// ── Line / Combination / Area / 100% Area ──
function LineArea({ data, valueIsMean, H, mode }: SubProps & { mode: "line" | "combo" | "area" | "area100" }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const mL = 40, mR = 16, mT = 26, mB = 40;
  const plotW = W - mL - mR, plotH = H - mT - mB, baseY = mT + plotH;
  const vals = mode === "area100" ? data.map(d => d.value / total * 100) : data.map(d => d.value);
  const maxV = Math.max(...vals, 1);
  const xAt = (i: number) => data.length === 1 ? mL + plotW / 2 : mL + (i / (data.length - 1)) * plotW;
  const yAt = (v: number) => baseY - (v / maxV) * plotH;
  const pts = vals.map((v, i) => [xAt(i), yAt(v)]);
  const linePath = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const maxBar = Math.max(...data.map(d => d.value), 1);
  return <g>
    {mode === "combo" && data.map((d, i) => {
      const bandW = plotW / data.length, bw = Math.min(48, bandW * 0.5);
      const h = (d.value / maxBar) * plotH, x = mL + i * bandW + (bandW - bw) / 2;
      return <rect key={i} x={x} y={baseY - h} width={bw} height={h} fill="#C0CAD6" />;
    })}
    {(mode === "area" || mode === "area100") &&
      <path d={`${linePath} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z`} fill={PRIMARY} fillOpacity="0.18" />}
    <path d={linePath} fill="none" stroke={mode === "combo" ? ACCENT : PRIMARY} strokeWidth="2.5" strokeLinejoin="round" />
    {pts.map((p, i) => (
      <g key={i}>
        <circle cx={p[0]} cy={p[1]} r="3.5" fill={mode === "combo" ? ACCENT : PRIMARY} />
        <text x={p[0]} y={p[1] - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>
          {mode === "area100" ? fmtPct(vals[i]) : fmtVal(data[i].value, valueIsMean)}</text>
        <text x={p[0]} y={baseY + 14} textAnchor="middle" fontSize="10" fill={MUTED}>{trunc(data[i].label, 10)}</text>
      </g>
    ))}
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" />
  </g>;
}

// ── Pie / Doughnut ──
function Pie({ data, valueIsMean, H, inner }: SubProps & { inner: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 170, cy = H / 2, r = Math.min(H / 2 - 20, 130), ir = r * inner;
  let a = -Math.PI / 2;
  return <g>
    {data.map((d, i) => {
      const frac = d.value / total, a2 = a + frac * Math.PI * 2;
      const large = a2 - a > Math.PI ? 1 : 0;
      const [x1, y1] = polar(cx, cy, r, a), [x2, y2] = polar(cx, cy, r, a2);
      const [xi1, yi1] = polar(cx, cy, ir, a), [xi2, yi2] = polar(cx, cy, ir, a2);
      const path = ir > 0
        ? `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${ir},${ir} 0 ${large} 0 ${xi1},${yi1} Z`
        : `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
      const [lx, ly] = polar(cx, cy, (r + ir) / 2, (a + a2) / 2);
      const seg = <g key={i}>
        <path d={path} fill={d.color} stroke="#fff" strokeWidth="2" />
        {frac > 0.06 && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="600" fill={inner > 0 ? INK : "#fff"}>{fmtPct(frac * 100)}</text>}
      </g>;
      a = a2; return seg;
    })}
    <g transform={`translate(${cx + r + 24}, ${cy - data.length * 10})`}>
      <Legend data={data} pctMode valueIsMean={valueIsMean} total={total} />
    </g>
  </g>;
}

// ── Scatter / Bubble ──
function Scatter({ data, valueIsMean, H, bubble }: SubProps & { bubble: boolean }) {
  const mL = 40, mR = 16, mT = 20, mB = 40;
  const plotW = W - mL - mR, plotH = H - mT - mB, baseY = mT + plotH;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const xAt = (i: number) => data.length === 1 ? mL + plotW / 2 : mL + (i / (data.length - 1)) * plotW;
  return <g>
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" />
    <line x1={mL} y1={mT} x2={mL} y2={baseY} stroke="#D4D4D8" />
    {data.map((d, i) => {
      const x = xAt(i), y = baseY - (d.value / maxV) * plotH;
      const r = bubble ? 6 + (d.value / maxV) * 26 : 6;
      return <g key={i}>
        <circle cx={x} cy={y} r={r} fill={d.color} fillOpacity={bubble ? 0.7 : 1} stroke="#fff" strokeWidth="1.5" />
        <text x={x} y={y - r - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>{fmtVal(d.value, valueIsMean)}</text>
        <text x={x} y={baseY + 14} textAnchor="middle" fontSize="10" fill={MUTED}>{trunc(d.label, 10)}</text>
      </g>;
    })}
  </g>;
}

// ── Mekko: variable-width columns (width ∝ value); % or unit height axis ──
function Mekko({ data, valueIsMean, H, unit }: SubProps & { unit: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const mL = 12, mR = 12, mT = 26, mB = 44, gap = 3;
  const plotW = W - mL - mR - gap * (data.length - 1), plotH = H - mT - mB, baseY = mT + plotH;
  let x = mL;
  return <g>
    {data.map((d, i) => {
      const w = (d.value / total) * plotW;
      const h = unit ? (d.value / maxV) * plotH : plotH;   // %-axis = full height, unit = scaled
      const y = baseY - h;
      const seg = <g key={i}>
        <rect x={x} y={y} width={Math.max(w, 0)} height={h} fill={d.color} />
        {w > 26 && <text x={x + w / 2} y={y + 14} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{fmtPct(d.value / total * 100)}</text>}
        <text x={x + w / 2} y={baseY + 14} textAnchor="middle" fontSize="10" fill={MUTED}>{trunc(d.label, 10)}</text>
      </g>;
      x += w + gap; return seg;
    })}
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" />
  </g>;
}
