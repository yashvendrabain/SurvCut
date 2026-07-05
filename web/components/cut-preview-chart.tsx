"use client";

/**
 * Renders a single cut as the right chart: a normal bar/column chart for most
 * types, or a ranks × options MATRIX (via CrossCutChart) for ranking cuts —
 * so ranking previews mirror the workbook's ranking block exactly. Shared by the
 * dashboard and the Generate visualizer so ranking looks the same in both.
 *
 * Chart-type values are kept as plain strings by the caller; this module casts.
 */
import { CutChart, CHART_GROUPS, type ChartType } from "@/components/cut-chart";
import { CrossCutChart, XCUT_CHART_TYPES, type XcutChartType } from "@/components/cross-cut-chart";
import { Select } from "@/components/ui/input";
import type { CutData, CutMatrix } from "@/lib/api-client";

function barDefault(qt: string): ChartType {
  if (["multi_select_binary", "grid_rated", "grid_single_select", "numeric_allocation", "numeric_grid"].includes(qt))
    return "clustered_bar";
  if (qt === "nps") return "pct_column";
  return "clustered_column";
}

/** Default chart type for a cut. Grid matrices read best as 100%-stacked columns
 * (scale distribution per option); ranking as grouped columns; else a bar/column. */
export function cutDefaultType(cut: CutData): string {
  if (cut.matrix) return cut.question_type.includes("grid") ? "pct_column" : "grouped_column";
  return barDefault(cut.question_type);
}

/** Render a matrix cut (grid / ranking) as an HTML count table with column totals. */
export function CutMatrixTable({ matrix }: { matrix: CutMatrix }) {
  const { row_labels, col_labels, counts } = matrix;
  const colTotals = col_labels.map((_c, j) => row_labels.reduce((s, _r, i) => s + (counts[i]?.[j] ?? 0), 0));
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="text-ink-500">
            <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold" />
            {col_labels.map((c, j) => (
              <th key={j} className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row_labels.map((r, i) => (
            <tr key={i} className="border-t border-ink-100">
              <td className="sticky left-0 bg-white px-2 py-1 font-medium text-ink-700" title={r}>{r}</td>
              {col_labels.map((_c, j) => (
                <td key={j} className="px-2 py-1 text-right font-mono text-ink-600">
                  {Math.round(counts[i]?.[j] ?? 0).toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-ink-200 font-semibold text-ink-800">
            <td className="sticky left-0 bg-white px-2 py-1">Total</td>
            {colTotals.map((t, j) => (
              <td key={j} className="px-2 py-1 text-right font-mono">{Math.round(t).toLocaleString()}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CutTypePicker(
  { cut, value, onChange, className }:
  { cut: CutData; value: string; onChange: (v: string) => void; className?: string },
) {
  if (cut.matrix) {
    return (
      <Select value={value} onChange={e => onChange(e.target.value)} className={className}>
        {XCUT_CHART_TYPES.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
      </Select>
    );
  }
  return (
    <Select value={value} onChange={e => onChange(e.target.value)} className={className}>
      {CHART_GROUPS.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

export function CutPreviewChart({ cut, type }: { cut: CutData; type: string }) {
  if (cut.matrix) {
    return (
      <CrossCutChart
        rowLabels={cut.matrix.row_labels}
        colLabels={cut.matrix.col_labels}
        counts={cut.matrix.counts}
        type={type as XcutChartType}
      />
    );
  }
  return <CutChart rows={cut.rows} type={type as ChartType} valueIsMean={cut.value_is_mean} />;
}
