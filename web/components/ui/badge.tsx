import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-ink-100 border-ink-200 text-ink-600",
  bain:    "bg-bain-50 border-bain-200 text-bain-700",
  green:   "bg-emerald-50 border-emerald-200 text-emerald-700",
  amber:   "bg-amber-50 border-amber-200 text-amber-700",
  red:     "bg-red-50 border-red-200 text-red-700",
  blue:    "bg-sky-50 border-sky-200 text-sky-700",
} as const;

type Tone = keyof typeof tones;

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
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
  const tone: Tone =
    t.includes("single") || t.includes("binary") ? "blue" :
    t.includes("multi") ? "amber" :
    t.includes("grid") || t.includes("numeric_alloc") ? "bain" :
    t.includes("rank") ? "green" :
    t.includes("nps") ? "red" :
    "neutral";
  return <Badge tone={tone}>{type}</Badge>;
}
