"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/upload",    label: "Upload" },
  { href: "/validate",  label: "Validate" },
  { href: "/filters-segments", label: "Add/Create filters" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/crosscuts", label: "Create cuts" },
  { href: "/generate",  label: "Generate" },
];

export function WizardProgress() {
  const pathname = usePathname();
  const activeIdx = STEPS.findIndex(s => s.href === pathname);
  const active = activeIdx === -1 ? 0 : activeIdx;

  return (
    <div className="mb-10 animate-fade-in">
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
                    backgroundColor: done ? "#059669" : current ? "#CC0000" : "#FFFFFF",
                    borderColor: done ? "#059669" : current ? "#CC0000" : "#E7E7EA",
                  }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-soft"
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
                    current ? "text-bain-600" : done ? "text-emerald-600" : "text-ink-400 group-hover:text-ink-500"
                  )}>
                    Step {i + 1}
                  </div>
                  <div className={cn(
                    "text-sm font-medium",
                    current ? "text-ink-900" : done ? "text-emerald-700" : "text-ink-400 group-hover:text-ink-600"
                  )}>
                    {s.label}
                  </div>
                </div>
              </Link>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 flex-1 mx-3 rounded-full transition-colors",
                  i < active ? "bg-emerald-400" : "bg-ink-200"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
