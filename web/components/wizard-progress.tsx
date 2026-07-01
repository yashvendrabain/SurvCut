"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/upload",    label: "Upload" },
  { href: "/validate",  label: "Validate" },
  { href: "/themes",    label: "Themes" },
  { href: "/crosscuts", label: "Cross Cuts" },
  { href: "/generate",  label: "Generate" },
];

export function WizardProgress() {
  const pathname = usePathname();
  const activeIdx = STEPS.findIndex(s => s.href === pathname);
  const active = activeIdx === -1 ? 0 : activeIdx;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <div key={s.href} className="flex items-center flex-1">
              <Link href={s.href} className="flex items-center gap-3 group flex-1">
                <motion.div
                  initial={false}
                  animate={{
                    scale: current ? 1.1 : 1,
                    backgroundColor: done ? "#059669" : current ? "#CC0000" : "rgba(255,255,255,0.05)",
                  }}
                  className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border",
                    done ? "border-emerald-500" : current ? "border-bain-500" : "border-white/10",
                    "transition-all"
                  )}
                >
                  {done ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : (
                    <span className={cn("text-xs font-bold", current ? "text-white" : "text-ink-400")}>
                      {i + 1}
                    </span>
                  )}
                </motion.div>
                <div className="flex-shrink-0">
                  <div className={cn(
                    "text-xs uppercase tracking-wider font-semibold",
                    current ? "text-white" : done ? "text-emerald-400" : "text-ink-500 group-hover:text-ink-300"
                  )}>
                    Step {i + 1}
                  </div>
                  <div className={cn(
                    "text-sm font-medium",
                    current ? "text-white" : done ? "text-emerald-400" : "text-ink-400 group-hover:text-ink-200"
                  )}>
                    {s.label}
                  </div>
                </div>
              </Link>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "h-px flex-1 mx-3",
                  i < active ? "bg-emerald-500/50" : "bg-white/10"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}