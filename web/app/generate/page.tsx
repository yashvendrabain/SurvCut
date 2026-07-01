"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Download, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { buildWorkbook, downloadUrl, type BuildResponse } from "@/lib/api-client";
import { useWizardStore } from "@/lib/store";
import { WizardProgress } from "@/components/wizard-progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile, EmptyState, Spinner } from "@/components/ui/misc";

export default function GeneratePage() {
  const router = useRouter();
  const sessionId = useWizardStore(s => s.sessionId);
  const schema = useWizardStore(s => s.schema);
  const themes = useWizardStore(s => s.themes);
  const themeOrder = useWizardStore(s => s.themeOrder);
  const filterQids = useWizardStore(s => s.filterQids);
  const queuedCrossCuts = useWizardStore(s => s.queuedCrossCuts);

  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildResponse | null>(null);

  async function build() {
    if (!sessionId) return;
    setBuilding(true);
    setResult(null);
    try {
      const names = themeOrder.filter(t => (themes[t]?.length ?? 0) > 0);
      const qids = names.map(t => themes[t] ?? []);
      const res = await buildWorkbook(
        sessionId, names, qids, filterQids,
        queuedCrossCuts.map(x => ({ row_qid: x.row, col_qid: x.col })),
      );
      setResult(res);
      toast.success(`Built ${(res.size_bytes / 1024 / 1024).toFixed(2)} MB workbook`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Build failed", { description: msg.slice(0, 200) });
    } finally {
      setBuilding(false);
    }
  }

  if (!schema) {
    return (
      <div>
        <WizardProgress />
        <EmptyState
          title="Nothing to generate yet"
          description="Upload a file and configure themes first."
          action={<Link href="/upload"><Button>← Go to Upload</Button></Link>}
        />
      </div>
    );
  }

  const nonEmptyThemes = themeOrder.filter(t => (themes[t]?.length ?? 0) > 0);

  return (
    <div>
      <WizardProgress />

      <div className="mb-6">
        <h1 className="text-4xl font-black tracking-tight mb-2">Generate workbook</h1>
        <p className="text-ink-400">
          Review the plan, then build the Excel workbook. Live formulas, filter dropdowns, cross-cut sheets — all included.
        </p>
      </div>

      {/* Plan summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Theme sheets" value={nonEmptyThemes.length} tone="bain" />
        <StatTile label="Questions to cut"  value={Object.values(themes).flat().length} tone="green" />
        <StatTile label="Filter slots" value={filterQids.length} />
        <StatTile label="Cross-cut sheets"  value={queuedCrossCuts.length} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-bain-500" />
            <span className="font-semibold">Theme sheets ({nonEmptyThemes.length})</span>
          </div>
          {nonEmptyThemes.length === 0 ? (
            <p className="text-sm text-ink-500">
              No themes have any questions. Go to <Link href="/themes" className="text-bain-400 underline">Themes</Link> and add some.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {nonEmptyThemes.map(name => (
                <div key={name} className="flex items-center justify-between text-sm py-1">
                  <span className="text-ink-200">{name}</span>
                  <Badge tone="neutral">{themes[name].length} questions</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-bain-500" />
            <span className="font-semibold">Cross-cut sheets ({queuedCrossCuts.length})</span>
          </div>
          {queuedCrossCuts.length === 0 ? (
            <p className="text-sm text-ink-500">
              None queued. Add some on the <Link href="/crosscuts" className="text-bain-400 underline">Cross Cuts</Link> page (optional).
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {queuedCrossCuts.map((cc, i) => (
                <div key={i} className="text-sm py-1 font-mono">
                  <span className="text-bain-400">{cc.row}</span>
                  <span className="text-ink-500 mx-1">×</span>
                  <span className="text-bain-400">{cc.col}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={() => router.push("/crosscuts")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button size="lg" onClick={build} disabled={building || nonEmptyThemes.length === 0}>
          {building ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Building…</>
          ) : (
            <><Zap className="w-5 h-5" /> Build workbook</>
          )}
        </Button>
      </div>

      <AnimatePresence>
        {result && sessionId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mt-8"
          >
            <Card className="border-emerald-500/40 bg-emerald-500/[0.03]">
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </motion.div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold">Workbook built successfully</h3>
                  <p className="text-sm text-ink-400">
                    {(result.size_bytes / 1024 / 1024).toFixed(2)} MB · Ready to download
                  </p>
                </div>
                <a
                  href={downloadUrl(sessionId)}
                  download="survey_cuts.xlsx"
                  className="btn-bain inline-flex"
                >
                  <Download className="w-4 h-4" /> Download .xlsx
                </a>
              </div>
              <div className="text-xs text-ink-500 font-mono break-all">
                {result.workbook_path}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}