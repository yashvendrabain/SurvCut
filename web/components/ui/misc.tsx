"use client";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} />;
}

export function StatTile({ label, value, tone = "neutral" }: {
  label: string;
  value: string | number;
  tone?: "neutral" | "bain" | "green" | "amber";
}) {
  const toneClasses = {
    neutral: "border-white/10",
    bain: "border-bain-500/40",
    green: "border-emerald-500/40",
    amber: "border-amber-500/40",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("glass rounded-xl p-4 border", toneClasses[tone])}
    >
      <div className="text-xs uppercase tracking-wider text-ink-400 mb-1 font-semibold">{label}</div>
      <div className="text-3xl font-black tracking-tight text-white">{value}</div>
    </motion.div>
  );
}

export function EmptyState({ title, description, action }: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-12 text-center">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-ink-400 mb-6 max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}