import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { QueryProvider } from "@/components/query-provider";

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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 text-ink-100">
        <QueryProvider>
          <div className="min-h-screen bg-grid-pattern bg-[size:32px_32px]">
            <div className="min-h-screen bg-radial-red">
              <Navbar />
              <main className="max-w-7xl mx-auto px-6 py-10">
                {children}
              </main>
            </div>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}