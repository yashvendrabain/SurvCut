"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { uploadCombined } from "@/lib/api-client";
import { useWizardStore } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatTile, Spinner } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { WizardProgress } from "@/components/wizard-progress";
import { cn } from "@/lib/utils";

export default function UploadPage() {
  const router = useRouter();
  const setUploadResult = useWizardStore(s => s.setUploadResult);
  const reset = useWizardStore(s => s.reset);
  const uploadSummary = useWizardStore(s => s.uploadSummary);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleFile = useCallback(async (file: File) => {
    reset();
    setError(null);
    setFileName(file.name);
    setUploading(true);
    try {
      const res = await uploadCombined(file);
      setUploadResult(res);
      toast.success(`Parsed ${res.n_datamap_blocks} questions from ${file.name}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Upload failed", { description: msg.slice(0, 200) });
    } finally {
      setUploading(false);
    }
  }, [reset, setUploadResult]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <WizardProgress />

      <div className="mb-6">
        <h1 className="text-4xl font-black tracking-tight mb-2">Upload survey data</h1>
        <p className="text-ink-400">
          Drop a combined <code className="text-bain-400 font-mono text-sm">.xlsx</code> with a Datamap sheet and a Raw data sheet.
          The datamap headers must be bracketed like <code className="text-bain-400 font-mono text-sm">[Q1]: text</code>.
        </p>
      </div>

      {!uploadSummary && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            "relative rounded-2xl border-2 border-dashed p-12 text-center transition-all",
            dragOver
              ? "border-bain-500 bg-bain-500/5"
              : "border-white/20 hover:border-white/30 bg-white/[0.02]"
          )}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4",
            dragOver ? "bg-bain-500/20" : "bg-white/5"
          )}>
            <Upload className={cn("w-8 h-8", dragOver ? "text-bain-500" : "text-ink-400")} />
          </div>

          <h3 className="text-xl font-semibold mb-2">
            {uploading ? "Uploading & parsing…" : dragOver ? "Drop it right here" : "Drop your file, or click to pick"}
          </h3>
          <p className="text-sm text-ink-400 mb-6">
            {fileName || ".xlsx / .xlsm up to 100 MB"}
          </p>

          {uploading ? (
            <div className="inline-flex items-center gap-3 text-bain-400">
              <Spinner className="w-5 h-5" />
              <span className="text-sm font-semibold">Parsing datamap + classifying questions…</span>
            </div>
          ) : (
            <label className="inline-block">
              <input
                type="file"
                accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onPick}
                className="hidden"
              />
              <span className="btn-bain cursor-pointer inline-flex">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Choose file
              </span>
            </label>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30"
          >
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-400 mb-1">Upload failed</div>
              <div className="text-sm text-red-300/80 font-mono">{error}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadSummary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 space-y-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-semibold">Parsed successfully</h2>
              <Badge tone="green">session {uploadSummary.session_id.slice(0, 8)}…</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatTile label="Respondents" value={uploadSummary.n_respondents} tone="bain" />
              <StatTile label="Raw columns"  value={uploadSummary.n_raw_columns} />
              <StatTile label="Datamap blocks"  value={uploadSummary.n_datamap_blocks} />
              <StatTile label="Analysis-eligible" value={uploadSummary.n_eligible_questions} tone="green" />
            </div>

            {uploadSummary.validation_errors.length > 0 && (
              <Card className="border-red-500/40">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="font-semibold text-red-400">{uploadSummary.validation_errors.length} validation errors</span>
                </div>
                <ul className="space-y-1 text-sm text-red-300/80 font-mono">
                  {uploadSummary.validation_errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </Card>
            )}

            {uploadSummary.validation_warnings.length > 0 && (
              <Card className="border-amber-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-amber-400">{uploadSummary.validation_warnings.length} warnings</span>
                </div>
                <ul className="space-y-1 text-sm text-amber-300/80 font-mono max-h-40 overflow-y-auto">
                  {uploadSummary.validation_warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="flex justify-between items-center pt-4">
              <Button variant="ghost" onClick={() => reset()}>
                Upload different file
              </Button>
              <Button
                onClick={() => router.push("/validate")}
                disabled={uploadSummary.validation_errors.length > 0}
              >
                Continue to Validate →
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}