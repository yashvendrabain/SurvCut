"use client";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Down-chevron drawn in ink-500 so it reads on the light control surface.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-3.5 py-2.5 bg-white border border-ink-200 rounded-xl text-sm text-ink-900 placeholder-ink-400 shadow-soft",
          "focus:outline-none focus:ring-2 focus:ring-bain-500/70 focus:border-bain-400",
          "transition-all duration-200",
          className
        )}
        {...rest}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, style, ...rest }, ref) {
    return (
      <select
        ref={ref}
        style={{
          backgroundImage: CHEVRON,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.65rem center",
          ...style,
        }}
        className={cn(
          // Explicit dark text on a white surface — options inherit the global `option` rule
          "w-full px-3.5 py-2.5 bg-white border border-ink-200 rounded-xl text-sm text-ink-900 shadow-soft cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-bain-500/70 focus:border-bain-400",
          "transition-all duration-200 appearance-none pr-10 hover:border-ink-300",
          className
        )}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1.5", className)}
      {...rest}
    />
  );
}
