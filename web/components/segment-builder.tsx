"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X, Check, ChevronRight, Boxes, GitBranch } from "lucide-react";

import { useWizardStore, type Segment, type SegmentGroup, type SegmentCondition, newId } from "@/lib/store";
import type { RawColumn } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const OPS = [
  { v: ">=", label: "≥" },
  { v: ">", label: ">" },
  { v: "<=", label: "≤" },
  { v: "<", label: "<" },
  { v: "=", label: "=" },
  { v: "<>", label: "≠" },
];

/** Small AND/OR segmented toggle used for both condition- and predicate-level combinators. */
function OpToggle({ value, onChange }: { value: "AND" | "OR"; onChange: (v: "AND" | "OR") => void }) {
  return (
    <span className="inline-flex rounded-md border border-ink-200 overflow-hidden text-[11px] font-bold leading-none">
      {(["AND", "OR"] as const).map(op => (
        <button
          key={op}
          type="button"
          onClick={(e) => { e.preventDefault(); onChange(op); }}
          className={`px-2 py-1 transition-colors ${
            value === op ? "bg-bain-500 text-white" : "bg-white text-ink-500 hover:bg-ink-100"
          }`}
        >
          {op}
        </button>
      ))}
    </span>
  );
}

export function SegmentBuilder() {
  const schema = useWizardStore(s => s.schema);
  const segments = useWizardStore(s => s.segments);
  const addSegment = useWizardStore(s => s.addSegment);
  const updateSegment = useWizardStore(s => s.updateSegment);
  const removeSegment = useWizardStore(s => s.removeSegment);

  const [activeId, setActiveId] = useState<string>(segments[0]?.id ?? "");
  const active = segments.find(s => s.id === activeId) ?? null;

  const rawColumns: RawColumn[] = schema?.raw_columns ?? [];
  const colByName = useMemo(() => {
    const m: Record<string, RawColumn> = {};
    for (const c of rawColumns) m[c.name] = c;
    return m;
  }, [rawColumns]);
  const questionTextByCol = useMemo(() => {
    const m: Record<string, string> = {};
    for (const q of schema?.questions ?? []) m[q.column_id] = q.question_text;
    return m;
  }, [schema]);

  const hasOptions = (col: string) => (colByName[col]?.options.length ?? 0) > 0;

  // ── mutation helpers (immutable) ──
  const patchGroups = (seg: Segment, groups: SegmentGroup[]) => updateSegment(seg.id, { groups });
  const mapCond = (seg: Segment, gid: string, condId: string, fn: (c: SegmentCondition) => SegmentCondition) =>
    patchGroups(seg, seg.groups.map(g =>
      g.id === gid ? { ...g, conditions: g.conditions.map(c => (c.id === condId ? fn(c) : c)) } : g));

  function addGroup(seg: Segment) {
    patchGroups(seg, [...seg.groups, { id: newId("grp"), name: `Option ${seg.groups.length + 1}`, conditions: [], conditionsOp: "AND" }]);
  }
  function setConditionsOp(seg: Segment, gid: string, op: "AND" | "OR") {
    patchGroups(seg, seg.groups.map(g => (g.id === gid ? { ...g, conditionsOp: op } : g)));
  }
  function setPredicatesOp(seg: Segment, gid: string, condId: string, op: "AND" | "OR") {
    mapCond(seg, gid, condId, c => ({ ...c, predicatesOp: op }));
  }
  function removeGroup(seg: Segment, gid: string) {
    patchGroups(seg, seg.groups.filter(g => g.id !== gid));
  }
  function setGroupName(seg: Segment, gid: string, name: string) {
    patchGroups(seg, seg.groups.map(g => (g.id === gid ? { ...g, name } : g)));
  }
  function addCondition(seg: Segment, gid: string, column: string) {
    if (!column) return;
    const cond: SegmentCondition = {
      id: newId("cond"),
      column,
      predicatesOp: "OR",
      predicates: hasOptions(column) ? [] : [{ op: colByName[column]?.numeric ? ">=" : "=", value: "" }],
    };
    patchGroups(seg, seg.groups.map(g => (g.id === gid ? { ...g, conditions: [...g.conditions, cond] } : g)));
  }
  function removeCondition(seg: Segment, gid: string, condId: string) {
    patchGroups(seg, seg.groups.map(g =>
      g.id === gid ? { ...g, conditions: g.conditions.filter(c => c.id !== condId) } : g));
  }
  function toggleCode(seg: Segment, gid: string, condId: string, code: string) {
    mapCond(seg, gid, condId, c => {
      const on = c.predicates.some(p => p.op === "=" && p.value === code);
      return {
        ...c,
        predicates: on
          ? c.predicates.filter(p => !(p.op === "=" && p.value === code))
          : [...c.predicates, { op: "=", value: code }],
      };
    });
  }
  function setPredicate(seg: Segment, gid: string, condId: string, idx: number, patch: Partial<{ op: string; value: string }>) {
    mapCond(seg, gid, condId, c => ({ ...c, predicates: c.predicates.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));
  }
  function addPredicate(seg: Segment, gid: string, condId: string) {
    mapCond(seg, gid, condId, c => ({ ...c, predicates: [...c.predicates, { op: ">=", value: "" }] }));
  }
  function removePredicate(seg: Segment, gid: string, condId: string, idx: number) {
    mapCond(seg, gid, condId, c => ({ ...c, predicates: c.predicates.filter((_, i) => i !== idx) }));
  }

  function humanCond(c: SegmentCondition): string {
    const col = colByName[c.column];
    const glue = c.predicatesOp === "AND" ? " AND " : " OR ";
    if (hasOptions(c.column)) {
      const labels = c.predicates.filter(p => p.op === "=").map(p => col?.options.find(o => o.code === p.value)?.label ?? p.value);
      if (!labels.length) return `${c.column} (pick options)`;
      return c.predicatesOp === "AND"
        ? `${c.column} = all of {${labels.join(", ")}}`
        : `${c.column} ∈ {${labels.join(", ")}}`;
    }
    const parts = c.predicates.filter(p => p.value !== "").map(p => `${OPS.find(o => o.v === p.op)?.label ?? p.op} ${p.value}`);
    return parts.length ? `${c.column} ${parts.join(glue)}` : `${c.column} (set a value)`;
  }
  function humanGroup(g: SegmentGroup): string {
    const parts = g.conditions.map(humanCond);
    return parts.length ? parts.join(`  ${g.conditionsOp}  `) : "(no conditions yet)";
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Segment list */}
      <div className="lg:col-span-1 space-y-3">
        <Label>Segments ({segments.length})</Label>
        <div className="space-y-2">
          {segments.map(seg => {
            const on = seg.id === activeId;
            return (
              <button
                key={seg.id}
                onClick={() => setActiveId(seg.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                  on ? "bg-bain-50 border-bain-200 shadow-soft"
                     : "bg-white border-ink-200 hover:bg-ink-50 hover:-translate-y-0.5 shadow-soft"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold truncate flex items-center gap-1.5 ${on ? "text-bain-700" : "text-ink-800"}`}>
                    <Boxes className="w-4 h-4 flex-shrink-0" /> {seg.name}
                  </span>
                  <Badge tone="neutral">{seg.groups.length + (seg.includeOthers ? 1 : 0)}</Badge>
                </div>
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setActiveId(addSegment())}>
          <Plus className="w-4 h-4" /> New segment
        </Button>
        <Card className="p-4 border-ink-200">
          <p className="text-xs text-ink-500 leading-relaxed">
            A segment becomes a <strong className="text-ink-700">custom filter</strong> tagged to every
            cut &amp; cross-cut. Each option is <strong className="text-ink-700">AND</strong> across
            conditions; within a condition you <strong className="text-ink-700">OR</strong> options
            (tick them) or numeric comparisons (e.g. <code className="text-bain-600">≥ 25</code>).
            First matching option wins; the rest fall into “{active?.othersLabel || "Others"}”.
          </p>
        </Card>
      </div>

      {/* Editor */}
      <div className="lg:col-span-2">
        {!active ? (
          <Card className="text-center py-12">
            <p className="text-sm text-ink-500">No segment selected. Create one to start (e.g. “WLO 2026”).</p>
          </Card>
        ) : rawColumns.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-sm text-ink-500">No raw-data columns available. Upload a file first.</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* Segment name + others */}
            <Card>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[220px]">
                  <Label>Segment (filter) name</Label>
                  <Input value={active.name} onChange={(e) => updateSegment(active.id, { name: e.target.value })}
                         placeholder="e.g. WLO 2026" />
                </div>
                <Button variant="danger" size="sm" onClick={() => { removeSegment(active.id); setActiveId(segments.find(s => s.id !== active.id)?.id ?? ""); }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete segment
                </Button>
              </div>
              <label className="mt-4 flex items-center gap-2.5 cursor-pointer select-none">
                <span
                  onClick={() => updateSegment(active.id, { includeOthers: !active.includeOthers })}
                  className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    active.includeOthers ? "bg-bain-500 border-bain-500" : "border-ink-300 bg-white"
                  }`}
                >
                  {active.includeOthers && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="text-sm text-ink-700">
                  Put all remaining (unmatched) respondents into a final group named
                </span>
                <input
                  value={active.othersLabel}
                  onChange={(e) => updateSegment(active.id, { othersLabel: e.target.value })}
                  disabled={!active.includeOthers}
                  className="px-2 py-1 w-28 text-sm bg-white border border-ink-200 rounded-md text-ink-900 disabled:opacity-50"
                />
              </label>
            </Card>

            {/* Groups */}
            {active.groups.map((g, gi) => (
              <Card key={g.id} className="border-bain-100">
                <div className="flex items-center gap-2 mb-3">
                  <Badge tone="bain">{gi + 1}</Badge>
                  <Input value={g.name} onChange={(e) => setGroupName(active, g.id, e.target.value)}
                         placeholder="Option name (e.g. Winners)" className="max-w-xs" />
                  <div className="ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => removeGroup(active, g.id)}
                            disabled={active.groups.length <= 1}>
                      <X className="w-3.5 h-3.5" /> Remove option
                    </Button>
                  </div>
                </div>

                {/* Conditions */}
                <div className="space-y-3">
                  {g.conditions.length >= 2 && (
                    <div className="flex items-center gap-2 text-xs text-ink-500 pb-1">
                      <span>Combine these conditions with</span>
                      <OpToggle value={g.conditionsOp} onChange={(op) => setConditionsOp(active, g.id, op)} />
                    </div>
                  )}
                  {g.conditions.map((c, ci) => {
                    const col = colByName[c.column];
                    const qtext = questionTextByCol[c.column];
                    const nPreds = hasOptions(c.column)
                      ? c.predicates.filter(p => p.op === "=").length
                      : c.predicates.length;
                    return (
                      <div key={c.id}>
                        {ci > 0 && (
                          <div className="flex justify-center py-1">
                            <span className="px-2 py-0.5 rounded bg-ink-100 text-[10px] font-bold text-ink-500">{g.conditionsOp}</span>
                          </div>
                        )}
                        <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-xs text-bain-600">{c.column}</span>
                          {col?.numeric && <Badge tone="blue">numeric</Badge>}
                          <span className="text-sm text-ink-600 truncate">{qtext ?? (col?.numeric ? "numeric column" : "column")}</span>
                          {nPreds >= 2 && (
                            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-ink-400 uppercase tracking-wide">
                              match
                              <OpToggle value={c.predicatesOp} onChange={(op) => setPredicatesOp(active, g.id, c.id, op)} />
                            </span>
                          )}
                          <button onClick={() => removeCondition(active, g.id, c.id)}
                                  className={`text-ink-400 hover:text-bain-600 p-1 ${nPreds >= 2 ? "" : "ml-auto"}`} aria-label="Remove condition">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {hasOptions(c.column) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {col!.options.map(o => {
                              const on = c.predicates.some(p => p.op === "=" && p.value === o.code);
                              return (
                                <button
                                  key={o.code}
                                  onClick={() => toggleCode(active, g.id, c.id, o.code)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                    on ? "bg-bain-500 border-bain-500 text-white"
                                       : "bg-white border-ink-200 text-ink-600 hover:bg-ink-100"
                                  }`}
                                >
                                  {on && <Check className="w-3 h-3" />}
                                  <span className="font-mono opacity-70">{o.code}</span> {o.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {c.predicates.map((p, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                {idx > 0 && <span className="text-xs font-semibold text-ink-400 w-8">{c.predicatesOp}</span>}
                                <Select value={p.op} onChange={(e) => setPredicate(active, g.id, c.id, idx, { op: e.target.value })}
                                        className="w-20 text-center">
                                  {OPS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                                </Select>
                                <Input
                                  value={p.value}
                                  onChange={(e) => setPredicate(active, g.id, c.id, idx, { value: e.target.value })}
                                  placeholder="value (e.g. 25)"
                                  className="max-w-[160px]"
                                />
                                {c.predicates.length > 1 && (
                                  <button onClick={() => removePredicate(active, g.id, c.id, idx)}
                                          className="text-ink-400 hover:text-bain-600 p-1" aria-label="Remove comparison">
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={() => addPredicate(active, g.id, c.id)}>
                              <Plus className="w-3.5 h-3.5" /> {c.predicatesOp === "AND" ? "AND" : "OR"} another comparison
                            </Button>
                          </div>
                        )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add condition — ANY raw column */}
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-ink-400" />
                    <Select value="" onChange={(e) => addCondition(active, g.id, e.target.value)} className="max-w-md">
                      <option value="">+ Add a column condition (AND)…</option>
                      {rawColumns.map(rc => (
                        <option key={rc.name} value={rc.name}>
                          {rc.name}
                          {rc.options.length ? "  (options)" : rc.numeric ? "  (numeric)" : ""}
                          {questionTextByCol[rc.name] ? ` — ${questionTextByCol[rc.name].slice(0, 45)}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Human-readable preview */}
                <div className="mt-3 text-xs text-ink-500 flex items-start gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-bain-500" />
                  <span><strong className="text-ink-700">{g.name || "Option"}</strong> = {humanGroup(g)}</span>
                </div>
              </Card>
            ))}

            <Button variant="ghost" onClick={() => addGroup(active)}>
              <Plus className="w-4 h-4" /> Add another option
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
