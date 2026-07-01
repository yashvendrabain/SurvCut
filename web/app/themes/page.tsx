"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, Search, Filter, ArrowRight, ArrowLeft, Layers } from "lucide-react";

import { useWizardStore } from "@/lib/store";
import { WizardProgress } from "@/components/wizard-progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, TypeBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";

export default function ThemesPage() {
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
  const [activeTab, setActiveTab] = useState<"themes" | "filters">("themes");
  const [selectedTheme, setSelectedTheme] = useState<string>(themeOrder[0] ?? "");
  const [q, setQ] = useState("");

  const questionMap = useMemo(() => {
    const m: Record<string, typeof schema extends null ? never : NonNullable<typeof schema>["questions"][number]> = {} as any;
    schema?.questions.forEach(x => { m[x.column_id] = x; });
    return m;
  }, [schema]);

  const eligibleQuestions = useMemo(() => {
    return schema?.questions.filter(x => x.analysis_eligible) ?? [];
  }, [schema]);

  const assignedQids = useMemo(() => new Set(Object.values(themes).flat()), [themes]);
  const unassigned = eligibleQuestions.filter(x => !assignedQids.has(x.column_id));

  const singleSelects = useMemo(
    () => eligibleQuestions.filter(x => x.question_type === "single_select" && x.n_options >= 2),
    [eligibleQuestions]
  );

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
          action={<Link href="/upload"><Button>← Go to Upload</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <WizardProgress />

      <div className="mb-6">
        <h1 className="text-4xl font-black tracking-tight mb-2">Themes & filters</h1>
        <p className="text-ink-400">
          Group questions into theme sheets, and pick which questions become global filter dropdowns.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {(["themes", "filters"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${
              activeTab === t
                ? "border-bain-500 text-white"
                : "border-transparent text-ink-400 hover:text-ink-200"
            }`}
          >
            {t === "themes" ? <Layers className="w-4 h-4 inline mr-1.5" /> : <Filter className="w-4 h-4 inline mr-1.5" />}
            {t}
          </button>
        ))}
      </div>

      {activeTab === "themes" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Theme list */}
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
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        active
                          ? "bg-bain-500/10 border-bain-500/40"
                          : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold truncate ${active ? "text-white" : "text-ink-200"}`}>
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
              <Label>Add new theme</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Growth Ambition"
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
              </div>
            </div>

            {selectedTheme && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => { removeTheme(selectedTheme); setSelectedTheme(themeOrder.find(x => x !== selectedTheme) ?? ""); }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete "{selectedTheme}"
              </Button>
            )}

            <Card className="p-4 border-amber-500/20">
              <div className="text-xs text-ink-400">
                <strong className="text-amber-400">Unassigned:</strong> {unassigned.length} questions not in any theme.
              </div>
            </Card>
          </div>

          {/* Question picker */}
          <div className="lg:col-span-2">
            <Label>
              Questions in "{selectedTheme || "…"}" ({themes[selectedTheme]?.length ?? 0})
            </Label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
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
                      className={`w-full text-left px-4 py-2.5 border-b border-white/5 flex items-center gap-3 transition-colors ${
                        inCurrent
                          ? "bg-bain-500/10 hover:bg-bain-500/15"
                          : inOther
                            ? "bg-white/[0.01] opacity-50"
                            : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        inCurrent ? "bg-bain-500 border-bain-500" : "border-white/20"
                      }`}>
                        {inCurrent && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-bain-400">{question.column_id}</span>
                          <TypeBadge type={question.question_type} />
                          {inOther && (
                            <Badge tone="amber">
                              in another theme
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-ink-300 truncate mt-0.5">{question.question_text}</div>
                      </div>
                    </button>
                  );
                })}
                {filteredQuestions.length === 0 && (
                  <div className="py-8 text-center text-ink-500 text-sm">No matches.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <p className="text-sm text-ink-400 max-w-2xl">
              Pick up to 12 single-select questions to expose as global filter dropdowns on every theme sheet.
              These become the <code className="text-bain-400">Region / Industry / Sector</code>-style filters at the top of each cut sheet.
            </p>
          </div>

          <div className="mb-3 flex items-center gap-3">
            <Badge tone={filterQids.length >= 10 ? "amber" : "bain"}>
              {filterQids.length} / 12 selected
            </Badge>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto">
              {singleSelects.map(question => {
                const on = filterQids.includes(question.column_id);
                return (
                  <button
                    key={question.column_id}
                    onClick={() => toggleFilter(question.column_id)}
                    className={`w-full text-left px-4 py-2.5 border-b border-white/5 flex items-center gap-3 transition-colors ${
                      on ? "bg-bain-500/10 hover:bg-bain-500/15" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      on ? "bg-bain-500 border-bain-500" : "border-white/20"
                    }`}>
                      {on && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-bain-400">{question.column_id}</span>
                        <Badge tone="neutral">{question.n_options} options</Badge>
                        {question.is_demographic && <Badge tone="blue">demographic</Badge>}
                      </div>
                      <div className="text-sm text-ink-300 truncate mt-0.5">{question.question_text}</div>
                    </div>
                  </button>
                );
              })}
              {singleSelects.length === 0 && (
                <div className="py-8 text-center text-ink-500 text-sm">
                  No single-select questions with option lists to use as filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mt-8">
        <Button variant="ghost" onClick={() => router.push("/validate")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={() => router.push("/crosscuts")}>
          Continue to Cross Cuts <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}