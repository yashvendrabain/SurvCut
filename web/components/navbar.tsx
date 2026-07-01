"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const NAV = [
  { href: "/upload",     label: "Upload" },
  { href: "/validate",   label: "Validate" },
  { href: "/themes",     label: "Themes" },
  { href: "/crosscuts",  label: "Cross Cuts" },
  { href: "/generate",   label: "Generate" },
];

export function Navbar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-ink-950/80 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-1.5 h-6 bg-bain-500 group-hover:h-7 transition-all" />
          <span className="font-black tracking-widest text-sm">SURVCUT</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "text-white bg-white/10"
                    : "text-ink-400 hover:text-white hover:bg-white/5"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto text-xs text-ink-500 font-mono">v0.1.0 · phase 1</div>
      </div>
    </header>
  );
}