"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-bain-500 hover:bg-bain-600 active:bg-bain-700 text-white hover:shadow-[0_10px_30px_-8px_rgba(204,0,0,0.5)]",
  ghost:
    "bg-white hover:bg-ink-50 border border-ink-300 text-ink-800",
  danger:
    "bg-white hover:bg-bain-50 border border-bain-200 text-bain-600",
  outline:
    "bg-transparent hover:bg-ink-50 border border-ink-300 text-ink-700",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-5 py-2.5 text-sm rounded-md",
  lg: "px-6 py-3 text-base rounded-md",
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
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bain-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    />
  );
});
