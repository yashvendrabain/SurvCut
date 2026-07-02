import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bain-red brand — the single accent, tuned for contrast on light surfaces
        bain: {
          DEFAULT: "#CC0000",
          50:  "#FFF5F5",
          100: "#FFE4E4",
          200: "#FFC9C9",
          300: "#FF9B9B",
          400: "#F45B5B",
          500: "#CC0000",
          600: "#A80000",
          700: "#870000",
          800: "#5E0000",
          900: "#3D0000",
        },
        // Neutral scale — light theme runs from paper (50) to near-black ink (950)
        ink: {
          50:  "#FAFAF9",
          100: "#F4F4F5",
          200: "#E7E7EA",
          300: "#D3D3D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
          950: "#09090B",
        },
      },
      fontFamily: {
        // Bain.com is sans-serif dominant — bold clean sans for display + body.
        sans: ["Inter", "\"Helvetica Neue\"", "Arial", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Inter", "\"Helvetica Neue\"", "Arial", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["\"JetBrains Mono\"", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      backgroundImage: {
        // Subtle dark hairline grid on a light canvas
        "grid-pattern":
          "linear-gradient(to right, rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.035) 1px, transparent 1px)",
        // Faint brand wash in the corner
        "radial-red": "radial-gradient(circle at top right, rgba(204,0,0,0.06), transparent 55%)",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)",
        card: "0 1px 3px rgba(15,23,42,0.05), 0 10px 30px -12px rgba(15,23,42,0.12)",
        lift: "0 8px 30px -8px rgba(15,23,42,0.18)",
        "glow-bain": "0 8px 24px -6px rgba(204,0,0,0.35)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out both",
        "fade-in-up": "fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 2.2s linear infinite",
        float: "float 18s ease-in-out infinite",
        "float-slow": "float 26s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -22px, 0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
