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
    neutral: "border-ink-200",
    bain: "border-bain-200",
    green: "border-emerald-200",
    amber: "border-amber-200",
  };
  const accent = {
    neutral: "text-ink-900",
    bain: "text-bain-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={(e) => {
        const el = e.currentTarget as HTMLElement;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn("glass lift spotlight rounded-md p-4 border", toneClasses[tone])}
    >
      <div className="text-xs uppercase tracking-wider text-ink-500 mb-1 font-semibold">{label}</div>
      <div className={cn("text-3xl font-black tracking-tight", accent[tone])}>{value}</div>
    </motion.div>
  );
}

export function EmptyState({ title, description, action }: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass rounded-md p-12 text-center animate-fade-in-up">
      <h3 className="text-lg font-semibold text-ink-900 mb-2">{title}</h3>
      <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}
