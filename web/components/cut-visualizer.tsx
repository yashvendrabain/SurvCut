"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, X, Plus, Maximize2 } from "lucide-react";

import { getCuts, type CutData } from "@/lib/api-client";
import { CutChart, CHART_GROUPS, type ChartType } from "@/components/cut-chart";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface CutPoolItem { column_id: string; question_text: string; }

function defaultType(qt: string): ChartType {
  if (["multi_select_binary", "ranking", "grid_rated", "grid_single_select", "numeric_allocation"].includes(qt))
    return "clustered_bar";
  if (qt === "nps") return "pct_column";
  return "clustered_column";
}

export function CutVisualizer({ sessionId, pool }: { sessionId: string | null; pool: CutPoolItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [cuts, setCuts] = useState<Record<string, CutData>>({});
  const [types, setTypes] = useState<Record<string, ChartType>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreenId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenId]);

  const typePicker = (id: string, qt: string, className: string) => (
    <Select
      value={types[id] ?? defaultType(qt)}
      onChange={(e) => setTypes(t => ({ ...t, [id]: e.target.value as ChartType }))}
      className={className}
    >
      {CHART_GROUPS.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
        </optgroup>
      ))}
    </Select>
  );

  async function addQuestion(id: string) {
    if (!id || !sessionId || selected.includes(id)) return;
    setSelected(s => [...s, id]);
    if (cuts[id]) return;
    setLoadingIds(l => [...l, id]);
    setError(null);
    try {
      const data = await getCuts(sessionId, [id]);
      const cut = data[0];
      if (cut) {
        setCuts(c => ({ ...c, [id]: cut }));
        setTypes(t => (t[id] ? t : { ...t, [id]: defaultType(cut.question_type) }));
      }
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setLoadingIds(l => l.filter(x => x !== id));
    }
  }

  const textById = Object.fromEntries(pool.map(p => [p.column_id, p.question_text]));
  const available = pool.filter(p => !selected.includes(p.column_id));

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-bain-600" />
        <h2 className="text-lg font-bold tracking-tight text-ink-900">Visualize cuts</h2>
        {selected.length > 0 && <Badge tone="neutral">{selected.length}</Badge>}
        <span className="ml-auto text-xs text-ink-400">think-cell-style preview · pick a question, then switch chart type</span>
      </div>

      {/* Question picker */}
      <div className="flex items-center gap-2 mb-5 max-w-2xl">
        <Plus className="w-4 h-4 text-ink-400 shrink-0" />
        <Select
          value=""
          onChange={(e) => addQuestion(e.target.value)}
          disabled={!sessionId || pool.length === 0}
        >
          <option value="">
            {pool.length === 0 ? "Assign questions to a theme first…" : "Select a question to visualize…"}
          </option>
          {available.map(p => (
            <option key={p.column_id} value={p.column_id}>
              {p.column_id} — {p.question_text.slice(0, 70)}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">Failed to load preview: {error}</p>}

      {selected.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-sm text-ink-500">
            Pick a question above to preview it as a chart. Add as many as you like and switch chart type per cut.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {selected.map((id) => {
            const c = cuts[id];
            const loading = loadingIds.includes(id);
            return (
              <Card key={id} className="overflow-hidden">
                <div className="flex items-start gap-2 mb-3 flex-wrap">
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-bain-600">{id}</span>
                      {c?.headline_metric && <Badge tone="neutral">{c.headline_metric}</Badge>}
                    </div>
                    <p className="text-sm text-ink-700 truncate mt-0.5" title={textById[id]}>
                      {textById[id] ?? id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    {c && typePicker(id, c.question_type, "w-40 sm:w-44")}
                    {c && (
                      <button
                        onClick={() => setFullscreenId(id)}
                        className="text-ink-400 hover:text-bain-600 p-1 shrink-0"
                        aria-label="Full screen" title="Full screen"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setSelected(s => s.filter(x => x !== id))}
                      className="text-ink-400 hover:text-bain-600 p-1 shrink-0"
                      aria-label="Remove" title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-ink-100 bg-white p-2 h-[300px]">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <span className="inline-flex items-center gap-2 text-sm text-ink-400">
                        <Loader2 className="w-4 h-4 animate-spin text-bain-500" /> Computing…
                      </span>
                    </div>
                  ) : c ? (
                    <CutChart rows={c.rows} type={types[id] ?? defaultType(c.question_type)} valueIsMean={c.value_is_mean} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-ink-400">No data.</div>
                  )}
                </div>
                {c && <p className="mt-2 text-xs text-ink-400">n = {c.valid_n.toLocaleString()} respondents</p>}
              </Card>
            );
          })}
        </div>
      )}

      {/* Full-screen chart modal */}
      {fullscreenId && cuts[fullscreenId] && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={() => setFullscreenId(null)}
        >
          <div
            className="bg-white rounded-lg shadow-lift w-full max-w-6xl max-h-[92vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const c = cuts[fullscreenId]!;
              return (
                <>
                  <div className="flex items-start gap-2 mb-4 flex-wrap">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-bain-600">{fullscreenId}</span>
                        {c.headline_metric && <Badge tone="neutral">{c.headline_metric}</Badge>}
                      </div>
                      <p className="text-base font-semibold text-ink-900 mt-0.5">{textById[fullscreenId] ?? fullscreenId}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      {typePicker(fullscreenId, c.question_type, "w-48 sm:w-56")}
                      <button
                        onClick={() => setFullscreenId(null)}
                        className="text-ink-500 hover:text-bain-600 p-1 shrink-0"
                        aria-label="Close" title="Close (Esc)"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-md border border-ink-100 p-3 sm:p-4" style={{ height: "min(66vh, 620px)" }}>
                    <CutChart
                      rows={c.rows}
                      type={types[fullscreenId] ?? defaultType(c.question_type)}
                      valueIsMean={c.value_is_mean}
                    />
                  </div>
                  <p className="mt-3 text-xs text-ink-400">n = {c.valid_n.toLocaleString()} respondents</p>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
