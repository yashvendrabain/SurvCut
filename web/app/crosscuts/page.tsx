"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, ArrowRight, ArrowLeft, Table2 } from "lucide-react";
import { toast } from "sonner";

import { computeCrossCut } from "@/lib/api-client";
import { useWizardStore } from "@/lib/store";
import { WizardProgress } from "@/components/wizard-progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Spinner } from "@/components/ui/misc";

export default function CrossCutsPage() {
  const router = useRouter();
  const sessionId = useWizardStore(s => s.sessionId);
  const schema = useWizardStore(s => s.schema);
  const currentXcut = useWizardStore(s => s.currentXcut);
  const setXcutRow = useWizardStore(s => s.setXcutRow);
  const setXcutCol = useWizardStore(s => s.setXcutCol);
  const setXcutResult = useWizardStore(s => s.setXcutResult);
  const queueCurrentXcut = useWizardStore(s => s.queueCurrentXcut);
  const queuedCrossCuts = useWizardStore(s => s.queuedCrossCuts);
  const removeQueuedXcut = useWizardStore(s => s.removeQueuedXcut);

  const [computing, setComputing] = useState(false);

  const questionOptions = useMemo(() => {
    if (!schema) return [];
    return schema.questions.filter(q => q.analysis_eligible);
  }, [schema]);

  async function compute() {
    if (!sessionId || !currentXcut.row || !currentXcut.col) return;
    if (currentXcut.row === currentXcut.col) {
      toast.error("Row and column must be different");
      return;
    }
    setComputing(true);
    try {
      const res = await computeCrossCut(sessionId, currentXcut.row, currentXcut.col);
      setXcutResult(res);
      if (res.warnings.length) {
        toast.warning(res.warnings[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Compute failed", { description: msg.slice(0, 200) });
    } finally {
      setComputing(false);
    }
  }

  function queue() {
    if (!currentXcut.result) return;
    queueCurrentXcut();
    toast.success(`Added ${currentXcut.row} × ${currentXcut.col} to the queue`);
    setXcutResult(null);
  }

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
        <h1 className="font-display text-4xl font-black tracking-tight mb-2 text-ink-900">Cross cuts</h1>
        <p className="text-ink-500 max-w-3xl">
          Build a matrix of two questions — row categories against column categories. Each cell counts the
          respondents in both. Add matrices to the queue and they&rsquo;ll be written as separate sheets when you Generate.
        </p>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label>Row question</Label>
            <Select value={currentXcut.row} onChange={(e) => setXcutRow(e.target.value)}>
              <option value="">Pick a row question…</option>
              {questionOptions.map(question => (
                <option key={"r" + question.column_id} value={question.column_id}>
                  {question.column_id} — {question.question_text.slice(0, 60)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Column question</Label>
            <Select value={currentXcut.col} onChange={(e) => setXcutCol(e.target.value)}>
              <option value="">Pick a column question…</option>
              {questionOptions.map(question => (
                <option key={"c" + question.column_id} value={question.column_id}>
                  {question.column_id} — {question.question_text.slice(0, 60)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={compute} disabled={!currentXcut.row || !currentXcut.col || computing}>
            {computing ? <><Spinner className="w-4 h-4" /> Computing…</> : <><Play className="w-4 h-4" /> Compute</>}
          </Button>
        </div>
      </Card>

      <AnimatePresence>
        {currentXcut.result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ ease: [0.16, 1, 0.3, 1] }}
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-ink-900">
                  {currentXcut.row} × {currentXcut.col}
                </h3>
                <Badge tone="green">
                  {currentXcut.result.row_labels.length} × {currentXcut.result.col_labels.length}
                </Badge>
              </div>
              <Button onClick={queue}>
                Add to queue <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="glass rounded-2xl overflow-hidden">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 glass-solid border-b border-ink-200 z-10">
                    <tr className="text-left text-ink-500">
                      <th className="py-2.5 px-3 font-semibold min-w-[180px] sticky left-0 glass-solid">Row &darr; / Col &rarr;</th>
                      {currentXcut.result.col_labels.map(c => (
                        <th key={c} className="py-2.5 px-3 font-semibold text-right min-w-[100px] text-ink-700">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentXcut.result.row_labels.map((rlbl, i) => (
                      <tr key={rlbl} className="border-b border-ink-100 hover:bg-ink-50/70 transition-colors">
                        <td className="py-2 px-3 font-medium text-ink-800 sticky left-0 glass-solid">{rlbl}</td>
                        {currentXcut.result!.counts[i].map((v, j) => (
                          <td key={j} className="py-2 px-3 text-right font-mono text-ink-600">
                            {typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-ink-900">
          Queued cross-cuts <Badge tone={queuedCrossCuts.length ? "green" : "neutral"}>{queuedCrossCuts.length}</Badge>
        </h2>
        {queuedCrossCuts.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-400 text-center py-4">
              None yet. Compute a matrix above and add it to the queue.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {queuedCrossCuts.map((cc, i) => (
              <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
                <Badge tone="bain">{i + 1}</Badge>
                <div className="flex-1">
                  <span className="font-mono text-sm text-bain-600">{cc.row}</span>
                  <span className="text-ink-400 mx-2">×</span>
                  <span className="font-mono text-sm text-bain-600">{cc.col}</span>
                  <span className="text-xs text-ink-400 ml-3">({cc.rowN} × {cc.colN})</span>
                </div>
                <button
                  onClick={() => removeQueuedXcut(i)}
                  className="text-ink-400 hover:text-bain-600 transition-colors p-1"
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-8">
        <Button variant="ghost" onClick={() => router.push("/filters-segments")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={() => router.push("/generate")}>
          Continue to Generate <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
