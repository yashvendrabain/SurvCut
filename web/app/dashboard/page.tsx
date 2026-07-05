"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Filter, Boxes, Star, BarChart3, Table2, Plus, X, Loader2, ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

import {
  getCuts, computeCrossCut,
  type CutData, type CrossCutResponse, type PreviewSelection, type QuestionSummary,
} from "@/lib/api-client";
import { useWizardStore, type Segment } from "@/lib/store";
import { WizardProgress } from "@/components/wizard-progress";
import { CutPreviewChart, CutTypePicker, CutMatrixTable, cutDefaultType } from "@/components/cut-preview-chart";
import { CrossCutChart, XCUT_CHART_TYPES, type XcutChartType } from "@/components/cross-cut-chart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";

// Map a store Segment to the API payload (dropping empty groups/conditions).
function segmentToPayload(s: Segment) {
  return {
    name: s.name,
    include_others: s.includeOthers,
    others_label: s.othersLabel,
    groups: s.groups
      .map(g => ({
        name: g.name,
        conditions_op: g.conditionsOp,
        conditions: g.conditions
          .map(c => ({ column: c.column, predicates_op: c.predicatesOp, predicates: c.predicates.filter(p => p.value !== "") }))
          .filter(c => c.predicates.length > 0),
      }))
      .filter(g => g.conditions.length > 0),
  };
}
const segIsUsable = (s: Segment) => segmentToPayload(s).groups.length > 0;

const xKey = (row: string, col: string) => `${row}::${col}`;

export default function DashboardPage() {
  const router = useRouter();
  const sessionId = useWizardStore(s => s.sessionId);
  const schema = useWizardStore(s => s.schema);
  const filterQids = useWizardStore(s => s.filterQids);
  const segments = useWizardStore(s => s.segments);

  // Panel 1 — selections
  const [filterSel, setFilterSel] = useState<Record<string, string>>({});
  const [segSel, setSegSel] = useState<Record<string, string>>({});

  // Panel 2 — picked charts
  const [cutIds, setCutIds] = useState<string[]>([]);
  const [cutTypes, setCutTypes] = useState<Record<string, string>>({});
  const [cutView, setCutView] = useState<Record<string, "chart" | "table">>({});
  const [xPairs, setXPairs] = useState<{ row: string; col: string }[]>([]);
  const [xTypes, setXTypes] = useState<Record<string, XcutChartType>>({});
  const [row, setRow] = useState("");
  const [col, setCol] = useState("");
  const [considered, setConsidered] = useState<Record<string, boolean>>({});

  // selection-stamped result caches
  const [cuts, setCuts] = useState<Record<string, { selKey: string; data: CutData | null }>>({});
  const [xcuts, setXcuts] = useState<Record<string, { selKey: string; data: CrossCutResponse | null }>>({});
  const pending = useRef<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const eligible = useMemo(() => schema?.questions.filter(q => q.analysis_eligible) ?? [], [schema]);
  const qById = useMemo(() => Object.fromEntries((schema?.questions ?? []).map(q => [q.column_id, q])), [schema]);
  const usableSegments = useMemo(() => segments.filter(segIsUsable), [segments]);

  // Send EVERY configured filter + usable segment (including those on "All"), so
  // the preview applies the exact same filter set the workbook puts on every cut.
  const selection: PreviewSelection = useMemo(() => ({
    filter_selections: filterQids.map(qid => ({ column_id: qid, value: filterSel[qid] ?? "All" })),
    segments: usableSegments.map(segmentToPayload),
    segment_selections: usableSegments.map(s => ({ name: s.name, value: segSel[s.id] ?? "All" })),
  }), [filterSel, segSel, filterQids, usableSegments]);
  const selKey = useMemo(() => JSON.stringify(selection), [selection]);

  // "active" = filters the user actually narrowed (not left on "All").
  const activeCount =
    filterQids.filter(qid => (filterSel[qid] ?? "All") !== "All").length +
    usableSegments.filter(s => (segSel[s.id] ?? "All") !== "All").length;

  // Fetch any picked cut/cross-cut whose cached result is stale for the current selection.
  useEffect(() => {
    if (!sessionId) return;
    for (const id of cutIds) {
      if (cuts[id]?.selKey === selKey) continue;
      const pk = "c:" + id;
      if (pending.current.has(pk)) continue;
      pending.current.add(pk);
      getCuts(sessionId, [id], selection)
        .then(d => {
          const data = d[0] ?? null;
          setCuts(prev => ({ ...prev, [id]: { selKey, data } }));
          if (data) setCutTypes(t => (t[id] ? t : { ...t, [id]: cutDefaultType(data) }));
        })
        .catch(e => setError(String(e).slice(0, 200)))
        .finally(() => pending.current.delete(pk));
    }
    for (const p of xPairs) {
      const k = xKey(p.row, p.col);
      if (xcuts[k]?.selKey === selKey) continue;
      const pk = "x:" + k;
      if (pending.current.has(pk)) continue;
      pending.current.add(pk);
      computeCrossCut(sessionId, p.row, p.col, selection)
        .then(r => setXcuts(prev => ({ ...prev, [k]: { selKey, data: r } })))
        .catch(e => setError(String(e).slice(0, 200)))
        .finally(() => pending.current.delete(pk));
    }
  }, [sessionId, selKey, selection, cutIds, xPairs, cuts, xcuts]);

  if (!schema) {
    return (
      <div>
        <WizardProgress />
        <EmptyState title="Nothing to explore yet" description="Upload + validate a file first."
          action={<Link href="/upload"><Button><ArrowLeft className="w-4 h-4" /> Go to Upload</Button></Link>} />
      </div>
    );
  }

  const filterOptions = (q: QuestionSummary | undefined): string[] => {
    if (!q) return [];
    const opts = q.question_type === "multi_select_binary" ? q.sub_options : q.options;
    return opts.map(o => o.label);
  };
  const segOptions = (s: Segment): string[] =>
    [...s.groups.map(g => g.name), ...(s.includeOthers ? [s.othersLabel] : [])];

  const addCut = (id: string) => {
    if (!id || cutIds.includes(id)) return;
    setCutIds(x => [...x, id]);   // chart type is set when the data arrives (cutDefaultType)
  };
  const addXcut = () => {
    if (!row || !col || row === col) return;
    const k = xKey(row, col);
    if (xPairs.some(p => xKey(p.row, p.col) === k)) return;
    setXPairs(x => [...x, { row, col }]);
    setXTypes(t => (t[k] ? t : { ...t, [k]: "grouped_column" }));
  };
  const resetFilters = () => { setFilterSel({}); setSegSel({}); };

  return (
    <div>
      <WizardProgress />

      <div className="mb-6 animate-fade-in-up">
        <h1 className="font-display text-4xl font-black tracking-tight mb-2 text-ink-900">Dashboard</h1>
        <p className="text-ink-500 max-w-3xl">
          Explore your cuts and cross-cuts with the filters and segments you configured applied live. Purely for
          eyeballing what&rsquo;s worth keeping &mdash; it doesn&rsquo;t change what the workbook generates.
        </p>
      </div>

      {/* ── Panel 1: Filters & segments ── */}
      <Card className="mb-6 sticky top-2 z-10">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-bain-600" />
          <span className="font-semibold text-ink-900">Filters &amp; segments</span>
          <Badge tone={activeCount ? "bain" : "neutral"}>{activeCount} active</Badge>
          {activeCount > 0 && (
            <button onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-500 hover:text-bain-600">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
        {filterQids.length === 0 && usableSegments.length === 0 ? (
          <p className="text-sm text-ink-500">
            No filters or segments configured. Add some on <Link href="/filters-segments" className="text-bain-600 underline underline-offset-2">Add/create filters</Link> to enable them here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filterQids.map(qid => (
              <div key={qid}>
                <Label>{qid}{qById[qid]?.question_type === "multi_select_binary" ? " (multi)" : ""}</Label>
                <Select value={filterSel[qid] ?? "All"} onChange={e => setFilterSel(s => ({ ...s, [qid]: e.target.value }))}>
                  <option value="All">All</option>
                  {filterOptions(qById[qid]).map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
                </Select>
              </div>
            ))}
            {usableSegments.map(s => (
              <div key={s.id}>
                <Label><Boxes className="w-3 h-3 inline mr-1" />{s.name}</Label>
                <Select value={segSel[s.id] ?? "All"} onChange={e => setSegSel(v => ({ ...v, [s.id]: e.target.value }))}>
                  <option value="All">All</option>
                  {segOptions(s).map(nm => <option key={nm} value={nm}>{nm}</option>)}
                </Select>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* ── Panel 2a: Cut charts ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-bain-600" />
          <h2 className="text-lg font-bold text-ink-900">Cuts</h2>
          {cutIds.length > 0 && <Badge tone="neutral">{cutIds.length}</Badge>}
        </div>
        <div className="flex items-center gap-2 mb-4 max-w-2xl">
          <Plus className="w-4 h-4 text-ink-400 shrink-0" />
          <Select value="" onChange={e => addCut(e.target.value)}>
            <option value="">Select a cut to visualize…</option>
            {eligible.filter(q => !cutIds.includes(q.column_id)).map(q => (
              <option key={q.column_id} value={q.column_id}>{q.column_id} — {q.question_text.slice(0, 70)}</option>
            ))}
          </Select>
        </div>
        {cutIds.length === 0 ? (
          <Card className="text-center py-10"><p className="text-sm text-ink-500">Pick a cut above to preview it under the current filters.</p></Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {cutIds.map(id => {
              const entry = cuts[id];
              const ready = entry && entry.selKey === selKey && entry.data;
              const c = ready ? entry!.data! : null;
              const star = considered["c:" + id];
              const view = cutView[id] ?? "chart";
              return (
                <Card key={id} className="overflow-hidden">
                  <div className="flex items-start gap-2 mb-3 flex-wrap">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-bain-600">{id}</span>
                        {c?.headline_metric && <Badge tone="neutral">{c.headline_metric}</Badge>}
                      </div>
                      <p className="text-sm text-ink-700 truncate mt-0.5">{qById[id]?.question_text ?? id}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      <button onClick={() => setConsidered(v => ({ ...v, ["c:" + id]: !v["c:" + id] }))}
                        className={`p-1 shrink-0 ${star ? "text-amber-500" : "text-ink-300 hover:text-amber-500"}`}
                        aria-label="Mark as considered" title="Mark as considered">
                        <Star className="w-4 h-4" fill={star ? "currentColor" : "none"} />
                      </button>
                      {c?.matrix && (
                        <span className="inline-flex overflow-hidden rounded-md border border-ink-200 text-[11px] font-semibold">
                          {(["chart", "table"] as const).map(m => (
                            <button key={m} onClick={() => setCutView(v => ({ ...v, [id]: m }))}
                              className={`px-2 py-1 transition-colors ${view === m ? "bg-bain-500 text-white" : "bg-white text-ink-500 hover:bg-ink-100"}`}>
                              {m === "chart" ? "Chart" : "Table"}
                            </button>
                          ))}
                        </span>
                      )}
                      {c && view === "chart" && (
                        <CutTypePicker cut={c} value={cutTypes[id] ?? cutDefaultType(c)}
                          onChange={v => setCutTypes(t => ({ ...t, [id]: v }))} className="w-40 sm:w-44" />
                      )}
                      <button onClick={() => setCutIds(x => x.filter(y => y !== id))} className="text-ink-400 hover:text-bain-600 p-1 shrink-0" aria-label="Remove"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="rounded-md border border-ink-100 bg-white p-2 h-[300px]">
                    {c ? (view === "table" && c.matrix
                          ? <CutMatrixTable matrix={c.matrix} />
                          : <CutPreviewChart cut={c} type={cutTypes[id] ?? cutDefaultType(c)} />)
                      : ready ? <div className="h-full flex items-center justify-center text-sm text-ink-400">No data under this filter.</div>
                      : <div className="h-full flex items-center justify-center"><span className="inline-flex items-center gap-2 text-sm text-ink-400"><Loader2 className="w-4 h-4 animate-spin text-bain-500" /> Computing…</span></div>}
                  </div>
                  {c && <p className="mt-2 text-xs text-ink-400">n = {c.valid_n.toLocaleString()} respondents{activeCount ? " (filtered)" : ""}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Panel 2b: Cross-cut charts ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Table2 className="w-4 h-4 text-bain-600" />
          <h2 className="text-lg font-bold text-ink-900">Cross-cuts</h2>
          {xPairs.length > 0 && <Badge tone="neutral">{xPairs.length}</Badge>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end mb-4 max-w-3xl">
          <div>
            <Label>Row question</Label>
            <Select value={row} onChange={e => setRow(e.target.value)}>
              <option value="">Pick a row…</option>
              {eligible.map(q => <option key={"r" + q.column_id} value={q.column_id}>{q.column_id} — {q.question_text.slice(0, 45)}</option>)}
            </Select>
          </div>
          <div>
            <Label>Column question</Label>
            <Select value={col} onChange={e => setCol(e.target.value)}>
              <option value="">Pick a column…</option>
              {eligible.map(q => <option key={"c" + q.column_id} value={q.column_id}>{q.column_id} — {q.question_text.slice(0, 45)}</option>)}
            </Select>
          </div>
          <Button onClick={addXcut} disabled={!row || !col || row === col}><Plus className="w-4 h-4" /> Add</Button>
        </div>
        {xPairs.length === 0 ? (
          <Card className="text-center py-10"><p className="text-sm text-ink-500">Pick a row and column to preview a cross-cut under the current filters.</p></Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {xPairs.map(({ row: r, col: cc }) => {
              const k = xKey(r, cc);
              const entry = xcuts[k];
              const ready = entry && entry.selKey === selKey;
              const res = ready ? entry!.data : null;
              const hasData = res && res.row_labels.length && res.col_labels.length;
              const star = considered["x:" + k];
              return (
                <Card key={k} className="overflow-hidden">
                  <div className="flex items-start gap-2 mb-3 flex-wrap">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-bain-600">{r}</span><span className="text-ink-400">×</span><span className="font-mono text-xs text-bain-600">{cc}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      <button onClick={() => setConsidered(v => ({ ...v, ["x:" + k]: !v["x:" + k] }))}
                        className={`p-1 shrink-0 ${star ? "text-amber-500" : "text-ink-300 hover:text-amber-500"}`} aria-label="Mark as considered" title="Mark as considered">
                        <Star className="w-4 h-4" fill={star ? "currentColor" : "none"} />
                      </button>
                      {hasData && (
                        <Select value={xTypes[k] ?? "grouped_column"} onChange={e => setXTypes(t => ({ ...t, [k]: e.target.value as XcutChartType }))} className="w-40 sm:w-44">
                          {XCUT_CHART_TYPES.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
                        </Select>
                      )}
                      <button onClick={() => setXPairs(x => x.filter(p => xKey(p.row, p.col) !== k))} className="text-ink-400 hover:text-bain-600 p-1 shrink-0" aria-label="Remove"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="rounded-md border border-ink-100 bg-white p-2 h-[320px]">
                    {hasData ? <CrossCutChart rowLabels={res!.row_labels} colLabels={res!.col_labels} counts={res!.counts} type={xTypes[k] ?? "grouped_column"} />
                      : ready ? <div className="h-full flex items-center justify-center text-sm text-ink-400">{res?.warnings?.[0] || "No matrix under this filter / unsupported pairing."}</div>
                      : <div className="h-full flex items-center justify-center"><span className="inline-flex items-center gap-2 text-sm text-ink-400"><Loader2 className="w-4 h-4 animate-spin text-bain-500" /> Computing…</span></div>}
                  </div>
                  {hasData && <p className="mt-2 text-xs text-ink-400">{res!.row_labels.length} × {res!.col_labels.length} matrix{activeCount ? " (filtered)" : ""}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-8">
        <Button variant="ghost" onClick={() => router.push("/filters-segments")}><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={() => router.push("/crosscuts")}>Continue to Create cuts <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
