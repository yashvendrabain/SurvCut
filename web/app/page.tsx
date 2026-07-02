"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Upload, Zap, Layers, Sparkles } from "lucide-react";
import { MountainRange } from "@/components/mountain-range";
import { GlowCard } from "@/components/ui/glow-card";
import { Reveal } from "@/components/ui/reveal";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

const FEATURES = [
  { icon: Zap, title: "Fast", body: "Python engine + FastAPI backend. Parses 1000+ respondent datamaps in seconds." },
  { icon: Layers, title: "Every shape", body: "10 question types, cross-cuts, piped grids, rank matrices. Nothing dropped." },
  { icon: Sparkles, title: "Live Excel", body: "Global filters, custom segments, VLOOKUP label→code, IFERROR everywhere. Opens instantly." },
];

export default function LandingPage() {
  return (
    <div className="space-y-16">
      {/* Dark Vector-style hero with the forming-mountains animation */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#08080c]"
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 480px at 78% 60%, rgba(225,29,46,0.16), transparent 60%)," +
              "radial-gradient(700px 420px at 10% 8%, rgba(110,99,230,0.18), transparent 55%)",
          }}
        />
        <div className="relative grid lg:grid-cols-[1.05fr_1fr] gap-8 items-center p-8 md:p-12">
          <motion.div variants={container} initial="hidden" animate="show">
            <motion.p variants={item} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-bain-400 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-bain-500 animate-pulse" />
              Bain internal · Survey cutter
            </motion.p>
            <motion.h1 variants={item} className="font-display text-5xl md:text-6xl font-black tracking-tight leading-[1.03] text-white mb-6">
              Survey cuts,<br />
              <span className="text-bain-400">rebuilt for speed.</span>
            </motion.h1>
            <motion.span variants={item} className="block h-[3px] w-12 bg-bain-500 mb-7 origin-left" />
            <motion.p variants={item} className="max-w-xl text-lg text-white/70 leading-relaxed mb-9">
              Upload a datamap and raw data. Get a Bain-format Excel workbook with live formulas,
              cross-cuts, segments, and every question shape handled correctly — under a minute end-to-end.
            </motion.p>
            <motion.div variants={item} className="flex flex-wrap gap-3">
              <Link href="/upload" className="btn-bain">
                <Upload className="w-4 h-4 mr-2" />
                Start a cut
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <a
                href="https://github.com/yashvendrabain/SurvCut"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-md border border-white/25 text-white/90 hover:bg-white/10 hover:border-white/40 font-semibold text-sm transition-all active:scale-[0.98]"
              >
                View on GitHub
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative min-h-[240px]"
          >
            <MountainRange className="w-full h-auto" />
          </motion.div>
        </div>
      </motion.section>

      {/* Feature grid — spotlight cards that reveal on scroll */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08} className="h-full">
              <GlowCard className="glass lift rounded-md p-6 relative overflow-hidden h-full">
                <span className="absolute top-0 left-0 h-[3px] w-full bg-bain-500" aria-hidden />
                <div className="w-11 h-11 rounded-md bg-bain-50 flex items-center justify-center mb-5 border border-bain-100">
                  <f.icon className="w-5 h-5 text-bain-600" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-ink-900 tracking-tight">{f.title}</h3>
                <p className="text-sm text-ink-500 leading-relaxed">{f.body}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
