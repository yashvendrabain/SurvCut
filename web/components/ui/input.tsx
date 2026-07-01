"use client";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm text-ink-100 placeholder-ink-500",
          "focus:outline-none focus:ring-2 focus:ring-bain-500 focus:border-transparent",
          "transition-colors",
          className
        )}
        {...rest}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm text-ink-100",
          "focus:outline-none focus:ring-2 focus:ring-bain-500 focus:border-transparent",
          "transition-colors appearance-none pr-10",
          "bg-no-repeat bg-[position:right_0.5rem_center]",
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
      className={cn("block text-xs font-semibold text-ink-400 uppercase tracking-wider mb-1.5", className)}
      {...rest}
    />
  );
}