"use client";

import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-1 z-50 glass-solid border-b border-ink-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <span className="h-5 w-5 bg-bain-500 group-hover:scale-110 transition-transform" aria-hidden />
          <span className="font-black tracking-[0.22em] text-[15px] text-ink-900">SURVCUT</span>
        </Link>
        <span className="hidden sm:block ml-4 pl-4 border-l border-ink-200 text-[11px] uppercase tracking-[0.16em] text-ink-400 font-semibold">
          Survey cutter
        </span>
        <div className="ml-auto text-[11px] uppercase tracking-[0.16em] text-ink-400 font-semibold">
          Bain internal · v0.1.0
        </div>
      </div>
    </header>
  );
}
