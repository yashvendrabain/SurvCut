"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-bain-500 hover:bg-bain-600 active:bg-bain-700 text-white shadow-lg shadow-bain-500/20 hover:shadow-bain-500/40",
  ghost: "bg-white/5 hover:bg-white/10 border border-white/10 text-ink-100",
  danger: "bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400",
  outline: "bg-transparent hover:bg-white/5 border border-white/20 text-ink-100",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-5 py-2.5 text-sm rounded-lg",
  lg: "px-6 py-3 text-base rounded-lg",
} as const;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bain-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    />
  );
});