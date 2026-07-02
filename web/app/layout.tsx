import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { QueryProvider } from "@/components/query-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "SurvCut — Survey Cutter",
  description: "Bain-internal survey cutter tool. Fast, spec-driven cuts + cross-cuts + Excel export.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-ink-900 antialiased">
        <QueryProvider>
          {/* Bain red top rule — brand throughline across the whole app */}
          <div aria-hidden className="fixed top-0 inset-x-0 h-1 bg-bain-500 z-[60]" />

          <div className="min-h-screen flex flex-col pt-1">
            <Navbar />
            <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12">
              {children}
            </main>
            <footer className="border-t border-ink-200 mt-8">
              <div className="max-w-7xl mx-auto px-6 py-6 flex items-center gap-3">
                <span className="h-3 w-3 bg-bain-500" aria-hidden />
                <p className="text-xs uppercase tracking-[0.16em] text-ink-500 font-semibold">
                  SurvCut · Bain internal · Spec-driven survey cutter
                </p>
              </div>
            </footer>
          </div>

          <Toaster
            theme="light"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(255, 255, 255, 0.95)",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                color: "#18181B",
                backdropFilter: "blur(12px)",
                boxShadow: "0 10px 30px -12px rgba(15,23,42,0.2)",
              },
              className: "font-sans",
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
