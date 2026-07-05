"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { getSchema } from "@/lib/api-client";
import { useWizardStore } from "@/lib/store";
import { WizardProgress } from "@/components/wizard-progress";
import { Input, Select } from "@/components/ui/input";
import { Badge, TypeBadge } from "@/components/ui/badge";
import { StatTile, Spinner, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function ValidatePage() {
  const router = useRouter();
  const sessionId = useWizardStore(s => s.sessionId);
  const schema = useWizardStore(s => s.schema);
  const setSchema = useWizardStore(s => s.setSchema);

  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [eligibleOnly, setEligibleOnly] = useState(false);

  useEffect(() => {
    if (!sessionId || schema) return;
    setLoading(true);
    getSchema(sessionId)
      .then(setSchema)
      .catch((e) => toast.error("Failed to load schema", { description: String(e).slice(0, 200) }))
      .finally(() => setLoading(false));
  }, [sessionId, schema, setSchema]);

  const allTypes = useMemo(() => {
    if (!schema) return [];
    return Array.from(new Set(schema.questions.map(x => x.question_type))).sort();
  }, [schema]);

  const filtered = useMemo(() => {
    if (!schema) return [];
    const needle = q.trim().toLowerCase();
    return schema.questions.filter(question => {
      if (eligibleOnly && !question.analysis_eligible) return false;
      if (typeFilter !== "all" && question.question_type !== typeFilter) return false;
      if (needle && !question.column_id.toLowerCase().includes(needle) &&
          !question.question_text.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [schema, q, typeFilter, eligibleOnly]);

  if (!sessionId) {
    return (
      <div>
        <WizardProgress />
        <EmptyState
          title="No session yet"
          description="Upload a file first to see the parsed schema."
          action={<Link href="/upload"><Button><ArrowLeft className="w-4 h-4" /> Go to Upload</Button></Link>}
        />
      </div>
    );
  }

  if (loading || !schema) {
    return (
      <div>
        <WizardProgress />
        <div className="flex items-center gap-3 text-ink-500">
          <Spinner className="w-5 h-5 text-bain-500" />
          <span>Loading schema…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <WizardProgress />

      <div className="mb-6 animate-fade-in-up">
        <h1 className="font-display text-4xl font-black tracking-tight mb-2 text-ink-900">Validate schema</h1>
        <p className="text-ink-500">
          Every question the datamap declared, with its detected type. Anything <em>not</em> eligible for cuts is flagged.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total questions" value={schema.total_questions} />
        <StatTile label="Analysis-eligible" value={schema.analysis_eligible} tone="green" />
        <StatTile label="Respondents" value={schema.total_respondents} tone="bain" />
        <StatTile label="Excluded" value={schema.total_questions - schema.analysis_eligible} tone="amber" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[240px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <Input
              placeholder="Search by ID or text…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-52">
          <option value="all">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <button
          onClick={() => setEligibleOnly(v => !v)}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 ${
            eligibleOnly
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-soft"
              : "bg-white border-ink-200 text-ink-600 hover:bg-ink-50 shadow-soft"
          }`}
        >
          Eligible only
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass rounded-2xl overflow-hidden"
      >
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 glass-solid border-b border-ink-200 z-10">
              <tr className="text-left text-ink-500">
                <th className="py-3 px-4 font-semibold">Column ID</th>
                <th className="py-3 px-4 font-semibold">Question text</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold text-right">Options</th>
                <th className="py-3 px-4 font-semibold text-right">Sub-cols</th>
                <th className="py-3 px-4 font-semibold text-center">Eligible</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((question) => (
                <tr key={question.column_id} className="border-b border-ink-100 hover:bg-ink-50/70 transition-colors">
                  <td className="py-2 px-4 font-mono text-xs text-bain-600">{question.column_id}</td>
                  <td className="py-2 px-4 text-ink-800 max-w-xs truncate" title={question.question_text}>
                    {question.question_text}
                  </td>
                  <td className="py-2 px-4"><TypeBadge type={question.question_type} /></td>
                  <td className="py-2 px-4 text-right font-mono text-ink-500">{question.n_options || "—"}</td>
                  <td className="py-2 px-4 text-right font-mono text-ink-500">{question.n_sub_columns > 1 ? question.n_sub_columns : "—"}</td>
                  <td className="py-2 px-4 text-center">
                    {question.analysis_eligible ? (
                      <Badge tone="green">✓</Badge>
                    ) : (
                      <Badge tone="neutral">skipped</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-ink-400 text-sm">No questions match those filters.</div>
          )}
        </div>
      </motion.div>

      <div className="mt-4 text-sm text-ink-400">
        Showing {filtered.length} of {schema.total_questions} questions
      </div>

      <div className="flex justify-between items-center mt-8">
        <Button variant="ghost" onClick={() => router.push("/upload")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={() => router.push("/filters-segments")}>
          Continue to add/create filters <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
