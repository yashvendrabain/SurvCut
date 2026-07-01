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
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(24, 24, 27, 0.95)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#F4F4F5",
                backdropFilter: "blur(12px)",
              },
              className: "font-sans",
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}