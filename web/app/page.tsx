"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Upload, Zap, Layers, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="pt-16 pb-8"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-bain-500/10 border border-bain-500/20 text-bain-400 text-xs font-semibold mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-bain-500 animate-pulse" />
          SurvCut v3 · Bain internal
        </div>
        <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-6 bg-gradient-to-br from-white via-white to-ink-400 bg-clip-text text-transparent">
          Survey cuts,<br />
          <span className="text-bain-500">rebuilt for speed.</span>
        </h1>
        <p className="max-w-2xl text-lg text-ink-400 leading-relaxed mb-10">
          Upload a datamap + raw data. Get a Bain-format Excel workbook with live formulas, cross-cuts, and every question shape handled correctly. Under a minute end-to-end.
        </p>
        <div className="flex gap-4">
          <Link href="/upload" className="btn-bain">
            <Upload className="w-4 h-4 mr-2" />
            Start a cut
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
          <a href="https://github.com/yashvendrabain/SurvCut" target="_blank" rel="noreferrer" className="btn-ghost">
            View on GitHub
          </a>
        </div>
      </motion.section>

      {/* Feature grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Zap, title: "Fast", body: "Python engine + FastAPI backend. Parses 1000+ respondent datamaps in seconds." },
          { icon: Layers, title: "Every shape", body: "10 question types, cross-cuts, piped grids, rank matrices. Nothing dropped." },
          { icon: Sparkles, title: "Live Excel", body: "Global filter dropdowns, VLOOKUP label→code, IFERROR everywhere. Opens instantly." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.5 }}
            className="glass rounded-2xl p-6 hover:bg-white/[0.03] transition"
          >
            <div className="w-10 h-10 rounded-lg bg-bain-500/10 flex items-center justify-center mb-4 border border-bain-500/20">
              <f.icon className="w-5 h-5 text-bain-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
            <p className="text-sm text-ink-400 leading-relaxed">{f.body}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}