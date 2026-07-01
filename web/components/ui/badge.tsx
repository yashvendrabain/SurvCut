import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-white/5 border-white/10 text-ink-300",
  bain:    "bg-bain-500/10 border-bain-500/30 text-bain-400",
  green:   "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber:   "bg-amber-500/10 border-amber-500/30 text-amber-400",
  red:     "bg-red-500/10 border-red-500/30 text-red-400",
  blue:    "bg-blue-500/10 border-blue-500/30 text-blue-400",
} as const;

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof tones;
}

export function Badge({ tone = "neutral", className, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
        tones[tone],
        className
      )}
      {...rest}
    />
  );
}

/** Colour a badge automatically by question_type. */
export function TypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  const tone =
    t.includes("single") || t.includes("binary") ? "blue" :
    t.includes("multi") ? "amber" :
    t.includes("grid") || t.includes("numeric_alloc") ? "bain" :
    t.includes("rank") ? "green" :
    t.includes("nps") ? "red" :
    t.includes("open") || t.includes("meta") || t.includes("unknown") ? "neutral" :
    "neutral";
  return <Badge tone={tone as any}>{type}</Badge>;
}