"use client";

/**
 * Multi-series chart for a cross-cut matrix (row_labels × col_labels × counts).
 * Pure SVG, matching the think-cell-style look of <CutChart>. Column labels are
 * the series (coloured); row labels are the categories along the axis.
 */

export type XcutChartType =
  | "grouped_column" | "grouped_bar"
  | "stacked_column" | "stacked_bar"
  | "pct_column" | "pct_bar";

export const XCUT_CHART_TYPES: { key: XcutChartType; label: string }[] = [
  { key: "grouped_column", label: "Grouped column" },
  { key: "grouped_bar", label: "Grouped bar" },
  { key: "stacked_column", label: "Stacked column" },
  { key: "stacked_bar", label: "Stacked bar" },
  { key: "pct_column", label: "100% column" },
  { key: "pct_bar", label: "100% bar" },
];

const PALETTE = ["#CC0000", "#1F3A5F", "#6E8CA8", "#A9B8C9", "#7A7A85", "#9E2A2B", "#3F3F46", "#5B6B8C", "#C0CAD6", "#D4D4D8"];
const INK = "#27272A";
const MUTED = "#71717A";
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const W = 640;
const H = 380;

/** Colour for series `j`. Uses the base palette, then spreads any extra series
 * around the hue wheel so a many-series chart/legend stays distinguishable. */
function seriesColor(j: number): string {
  if (j < PALETTE.length) return PALETTE[j];
  const hue = ((j - PALETTE.length) * 47 + 20) % 360;
  return `hsl(${hue}, 42%, 47%)`;
}

function fmt(v: number) { return Math.round(v).toLocaleString(); }
function fmtPct(p: number) { return `${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10}%`; }
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

interface Props {
  rowLabels: string[];
  colLabels: string[];
  counts: number[][];    // counts[row][col]
  type: XcutChartType;
}

export function CrossCutChart({ rowLabels, colLabels, counts, type }: Props) {
  if (!rowLabels.length || !colLabels.length) {
    return <div className="text-sm text-ink-400 py-8 text-center">No data to chart.</div>;
  }
  const stacked = type.startsWith("stacked") || type.startsWith("pct");
  const pct = type.startsWith("pct");
  const horizontal = type.endsWith("bar");

  const rows = rowLabels.map((label, i) => ({
    label,
    cells: colLabels.map((_, j) => (counts[i]?.[j] ?? 0)),
    total: colLabels.reduce((s, _, j) => s + (counts[i]?.[j] ?? 0), 0),
  }));

  const body = stacked
    ? <Stacked rows={rows} colLabels={colLabels} horizontal={horizontal} pct={pct} />
    : <Grouped rows={rows} colLabels={colLabels} horizontal={horizontal} />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
             preserveAspectRatio="xMidYMid meet"
             style={{ fontFamily: FONT, display: "block" }} role="img">
          {body}
        </svg>
      </div>
      <LegendHtml colLabels={colLabels} />
    </div>
  );
}

type Row = { label: string; cells: number[]; total: number };

// Full wrapping HTML legend below the chart — shows every series (wraps to as
// many rows as needed and scrolls if there are a lot), unlike an in-SVG row
// that would clip. Colours match the bars via seriesColor().
function LegendHtml({ colLabels }: { colLabels: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 overflow-y-auto shrink-0"
         style={{ maxHeight: "38%" }}>
      {colLabels.map((c, j) => (
        <span key={j} className="inline-flex items-center gap-1 text-[10px] leading-tight text-ink-600">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: seriesColor(j) }} />
          <span className="truncate max-w-[150px]" title={c}>{c}</span>
        </span>
      ))}
    </div>
  );
}

// ── Grouped (clustered) columns / bars ──
function Grouped({ rows, colLabels, horizontal }: { rows: Row[]; colLabels: string[]; horizontal: boolean }) {
  const maxV = Math.max(1, ...rows.flatMap(r => r.cells));
  const nCol = colLabels.length;
  if (horizontal) {
    const mL = 130, mR = 40, mT = 8, mB = 40;
    const bandH = (H - mT - mB) / rows.length;
    const groupH = bandH * 0.82;
    const bh = groupH / nCol;
    const plotW = W - mL - mR;
    return <g>
      {rows.map((r, i) => {
        const y0 = mT + i * bandH + (bandH - groupH) / 2;
        return <g key={i}>
          <text x={mL - 8} y={y0 + groupH / 2} textAnchor="end" dominantBaseline="central" fontSize="11" fill={INK}>{trunc(r.label, 20)}</text>
          {r.cells.map((v, j) => {
            const y = y0 + j * bh;
            const w = (v / maxV) * plotW;
            return <g key={j}>
              <rect x={mL} y={y} width={Math.max(w, 0)} height={Math.max(bh - 1, 1)} fill={seriesColor(j)} />
              {w > 18 && <text x={mL + w + 4} y={y + bh / 2} dominantBaseline="central" fontSize="9" fill={MUTED}>{fmt(v)}</text>}
            </g>;
          })}
        </g>;
      })}
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke="#D4D4D8" />
    </g>;
  }
  const mL = 20, mR = 12, mT = 20, mB = 56;
  const bandW = (W - mL - mR) / rows.length;
  const groupW = bandW * 0.82;
  const bw = groupW / nCol;
  const plotH = H - mT - mB;
  const baseY = mT + plotH;
  return <g>
    {rows.map((r, i) => {
      const x0 = mL + i * bandW + (bandW - groupW) / 2;
      return <g key={i}>
        {r.cells.map((v, j) => {
          const h = (v / maxV) * plotH;
          const x = x0 + j * bw;
          return <g key={j}>
            <rect x={x} y={baseY - h} width={Math.max(bw - 1, 1)} height={Math.max(h, 0)} fill={seriesColor(j)} />
            {bw > 14 && h > 12 && <text x={x + bw / 2} y={baseY - h - 3} textAnchor="middle" fontSize="9" fill={MUTED}>{fmt(v)}</text>}
          </g>;
        })}
        <text x={x0 + groupW / 2} y={baseY + 14} textAnchor="middle" fontSize="11" fill={INK}>{trunc(r.label, 12)}</text>
      </g>;
    })}
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" />
  </g>;
}

// ── Stacked / 100% stacked columns / bars ──
function Stacked({ rows, colLabels, horizontal, pct }: { rows: Row[]; colLabels: string[]; horizontal: boolean; pct: boolean }) {
  const maxTotal = pct ? 1 : Math.max(1, ...rows.map(r => r.total));
  if (horizontal) {
    const mL = 130, mR = 40, mT = 8, mB = 40;
    const bandH = (H - mT - mB) / rows.length;
    const bh = Math.min(34, bandH * 0.7);
    const plotW = W - mL - mR;
    return <g>
      {rows.map((r, i) => {
        const y = mT + i * bandH + (bandH - bh) / 2;
        const denom = pct ? (r.total || 1) : maxTotal;
        let x = mL;
        return <g key={i}>
          <text x={mL - 8} y={y + bh / 2} textAnchor="end" dominantBaseline="central" fontSize="11" fill={INK}>{trunc(r.label, 20)}</text>
          {r.cells.map((v, j) => {
            const w = (v / denom) * plotW;
            const seg = <g key={j}>
              <rect x={x} y={y} width={Math.max(w - 1, 0)} height={bh} fill={seriesColor(j)} />
              {w > 26 && <text x={x + w / 2} y={y + bh / 2} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="600" fill="#fff">
                {pct ? fmtPct(r.total ? v / r.total * 100 : 0) : fmt(v)}</text>}
            </g>;
            x += w; return seg;
          })}
        </g>;
      })}
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke="#D4D4D8" />
    </g>;
  }
  const mL = 20, mR = 12, mT = 20, mB = 56;
  const bandW = (W - mL - mR) / rows.length;
  const bw = Math.min(72, bandW * 0.66);
  const plotH = H - mT - mB;
  const baseY = mT + plotH;
  return <g>
    {rows.map((r, i) => {
      const x = mL + i * bandW + (bandW - bw) / 2;
      const denom = pct ? (r.total || 1) : maxTotal;
      let y = baseY;
      return <g key={i}>
        {r.cells.map((v, j) => {
          const h = (v / denom) * plotH;
          y -= h;
          const seg = <g key={j}>
            <rect x={x} y={y} width={bw} height={Math.max(h - 1, 0)} fill={seriesColor(j)} />
            {h > 14 && <text x={x + bw / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="600" fill="#fff">
              {pct ? fmtPct(r.total ? v / r.total * 100 : 0) : fmt(v)}</text>}
          </g>;
          return seg;
        })}
        <text x={x + bw / 2} y={baseY + 14} textAnchor="middle" fontSize="11" fill={INK}>{trunc(r.label, 12)}</text>
      </g>;
    })}
    <line x1={mL} y1={baseY} x2={W - mR} y2={baseY} stroke="#D4D4D8" />
  </g>;
}
