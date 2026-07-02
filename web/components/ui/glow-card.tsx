"use client";

import { useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A surface with a cursor-following red glow (the "spotlight" premium effect)
 * plus a hover border highlight. Mouse position is written to CSS vars, so
 * there's no React re-render on move — cheap and smooth.
 */
export function GlowCard({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn("spotlight", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
