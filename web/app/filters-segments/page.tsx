"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, Filter, ArrowRight, ArrowLeft, Layers, Boxes } from "lucide-react";

import { useWizardStore, MAX_FILTERS } from "@/lib/store";
import { WizardProgress } from "@/components/wizard-progress";
import { SegmentBuilder } from "@/components/segment-builder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, TypeBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";

const TABS = [
  { key: "themes", label: "Theme sheets", icon: Layers },
  { key: "filters", label: "Filters", icon: Filter },
  { key: "segments", label: "Segments", icon: Boxes },
] as const;

export default function FiltersSegmentsPage() {
  const router = useRouter();
  const schema = useWizardStore(s => s.schema);
  const themes = useWizardStore(s => s.themes);
  const themeOrder = useWizardStore(s => s.themeOrder);
  const filterQids = useWizardStore(s => s.filterQids);
  const addThemeRow = useWizardStore(s => s.addThemeRow);
  const renameTheme = useWizardStore(s => s.renameTheme);
  const removeTheme = useWizardStore(s => s.removeTheme);
  const toggleQuestionInTheme = useWizardStore(s => s.toggleQuestionInTheme);
  const toggleFilter = useWizardStore(s => s.toggleFilter);

  const [newThemeName, setNewThemeName] = useState("");
  const [activeTab, setActiveTab] = useState<"themes" | "filters" | "segments">("themes");
  const [selectedTheme, setSelectedTheme] = useState<string>(themeOrder[0] ?? "");
  const [q, setQ] = useState("");

  const eligibleQuestions = useMemo(
    () => schema?.questions.filter(x => x.analysis_eligible) ?? [],
    [schema]
  );

  const assignedQids = useMemo(() => new Set(Object.values(themes).flat()), [themes]);
  const unassigned = eligibleQuestions.filter(x => !assignedQids.has(x.column_id));

  // Filterable = single-select questions (with an option list) + multi-select
  // questions. Both are added as WHOLE questions, mirroring cross-cuts. A
  // single-select filters by its picked option; a multi-select by a picked
  // sub-option (or "any answered").
  const filterable = useMemo(
    () => eligibleQuestions.filter(
      x => (x.question_type === "single_select" && x.n_options >= 2)
        || x.question_type === "multi_select_binary"
    ),
    [eligibleQuestions]
  );
  const filterOptionCount = (x: (typeof filterable)[number]) =>
    x.question_type === "multi_select_binary" ? x.n_sub_columns : x.n_options;

  const filteredQuestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return eligibleQuestions;
    return eligibleQuestions.filter(x =>
      x.column_id.toLowerCase().includes(needle) ||
      x.question_text.toLowerCase().includes(needle)
    );
  }, [eligibleQuestions, q]);

  if (!schema) {
    return (
      <div>
        <WizardProgress />
        <EmptyState
          title="No schema yet"
          description="Upload + validate a file first."
          action={<Link href="/upload"><Button><ArrowLeft className="w-4 h-4" /> Go to Upload</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <WizardProgress />

      <div className="mb-6 animate-fade-in-up">
        <h1 className="font-display text-4xl font-black tracking-tight mb-2 text-ink-900">Add / create filters</h1>
        <p className="text-ink-500">
          Group questions into theme sheets and choose which become global filter dropdowns. Segmentation lands here next.
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-ink-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? "border-bain-500 text-bain-700"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            <Icon className="w-4 h-4 inline mr-1.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "themes" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            <div>
              <Label>Themes ({themeOrder.length})</Label>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {themeOrder.map(name => {
                  const count = themes[name]?.length ?? 0;
                  const active = name === selectedTheme;
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedTheme(name)}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                        active
                          ? "bg-bain-50 border-bain-200 shadow-soft"
                          : "bg-white border-ink-200 hover:bg-ink-50 hover:-translate-y-0.5 shadow-soft"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold truncate ${active ? "text-bain-700" : "text-ink-800"}`}>
                          {name}
                        </span>
                        <Badge tone={count === 0 ? "neutral" : "green"}>{count}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Add or rename a theme</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={selectedTheme ? `Rename “${selectedTheme}” or add new…` : "e.g. Growth Ambition"}
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newThemeName.trim()) {
                      addThemeRow(newThemeName.trim());
                      setSelectedTheme(newThemeName.trim());
                      setNewThemeName("");
                    }
                  }}
                />
                <Button
                  size="md"
                  title="Add as new theme"
                  onClick={() => {
                    if (newThemeName.trim()) {
                      addThemeRow(newThemeName.trim());
                      setSelectedTheme(newThemeName.trim());
                      setNewThemeName("");
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  title="Rename the selected theme"
                  disabled={!selectedTheme || !newThemeName.trim() || newThemeName.trim() === selectedTheme}
                  onClick={() => {
                    const next = newThemeName.trim();
                    if (selectedTheme && next) {
                      renameTheme(selectedTheme, next);
                      setSelectedTheme(next);
                      setNewThemeName("");
                    }
                  }}
                >
                  Update
                </Button>
              </div>
              {selectedTheme && (
                <p className="text-xs text-ink-400 mt-1.5">
                  <strong className="text-ink-600">Update</strong> renames the selected theme
                  “{selectedTheme}”. Question assignments save automatically as you tick them.
                </p>
              )}
            </div>

            {selectedTheme && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => { removeTheme(selectedTheme); setSelectedTheme(themeOrder.find(x => x !== selectedTheme) ?? ""); }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete &ldquo;{selectedTheme}&rdquo;
              </Button>
            )}

            <Card className="p-4 border-amber-200">
              <div className="text-xs text-ink-600">
                <strong className="text-amber-600">Unassigned:</strong> {unassigned.length} questions not in any theme.
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Label>
              Questions in &ldquo;{selectedTheme || "…"}&rdquo; ({themes[selectedTheme]?.length ?? 0})
            </Label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <Input
                placeholder="Search all eligible questions…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="glass rounded-2xl overflow-hidden">
              <div className="max-h-[520px] overflow-y-auto">
                {filteredQuestions.map(question => {
                  const inCurrent = themes[selectedTheme]?.includes(question.column_id) ?? false;
                  const inOther = assignedQids.has(question.column_id) && !inCurrent;
                  return (
                    <button
                      key={question.column_id}
                      onClick={() => selectedTheme && toggleQuestionInTheme(selectedTheme, question.column_id)}
                      disabled={!selectedTheme}
                      className={`w-full text-left px-4 py-2.5 border-b border-ink-100 flex items-center gap-3 transition-colors ${
                        inCurrent
                          ? "bg-bain-50 hover:bg-bain-100"
                          : inOther
                            ? "bg-ink-50/50 opacity-60"
                            : "hover:bg-ink-50/70"
                      }`}
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        inCurrent ? "bg-bain-500 border-bain-500" : "border-ink-300 bg-white"
                      }`}>
                        {inCurrent && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-bain-600">{question.column_id}</span>
                          <TypeBadge type={question.question_type} />
                          {inOther && (
                            <Badge tone="amber">in another theme</Badge>
                          )}
                        </div>
                        <div className="text-sm text-ink-600 truncate mt-0.5">{question.question_text}</div>
                      </div>
                    </button>
                  );
                })}
                {filteredQuestions.length === 0 && (
                  <div className="py-8 text-center text-ink-400 text-sm">No matches.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "filters" ? (
        <div>
          <div className="mb-4">
            <p className="text-sm text-ink-500 max-w-2xl">
              Pick up to {MAX_FILTERS} questions to expose as global filter dropdowns on every theme &amp; cross-cut sheet.
              <strong className="text-ink-700"> Single-select</strong> questions filter by their picked option;
              <strong className="text-ink-700"> multi-select</strong> questions filter by a picked sub-option (or &ldquo;All&rdquo; = answered any).
              These become the <code className="text-bain-600 font-mono bg-bain-50 px-1.5 py-0.5 rounded">Region / Industry / Sector</code>-style filters at the top of each cut sheet.
            </p>
          </div>

          <div className="mb-3 flex items-center gap-3">
            <Badge tone={filterQids.length >= MAX_FILTERS - 2 ? "amber" : "bain"}>
              {filterQids.length} / {MAX_FILTERS} selected
            </Badge>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto">
              {filterable.map(question => {
                const on = filterQids.includes(question.column_id);
                const atCap = !on && filterQids.length >= MAX_FILTERS;
                return (
                  <button
                    key={question.column_id}
                    onClick={() => toggleFilter(question.column_id)}
                    disabled={atCap}
                    className={`w-full text-left px-4 py-2.5 border-b border-ink-100 flex items-center gap-3 transition-colors ${
                      on ? "bg-bain-50 hover:bg-bain-100" : atCap ? "opacity-40 cursor-not-allowed" : "hover:bg-ink-50/70"
                    }`}
                  >
                    <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      on ? "bg-bain-500 border-bain-500" : "border-ink-300 bg-white"
                    }`}>
                      {on && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-bain-600">{question.column_id}</span>
                        <TypeBadge type={question.question_type} />
                        <Badge tone="neutral">{filterOptionCount(question)} options</Badge>
                        {question.is_demographic && <Badge tone="blue">demographic</Badge>}
                      </div>
                      <div className="text-sm text-ink-600 truncate mt-0.5">{question.question_text}</div>
                    </div>
                  </button>
                );
              })}
              {filterable.length === 0 && (
                <div className="py-8 text-center text-ink-400 text-sm">
                  No single-select or multi-select questions to use as filters.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <SegmentBuilder />
      )}

      <div className="flex justify-between items-center mt-8">
        <Button variant="ghost" onClick={() => router.push("/validate")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={() => router.push("/dashboard")}>
          Continue to Dashboard <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
