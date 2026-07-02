"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Vector/AI-style "forming mountains" animation: overlapping gradient
 * distributions rise from a baseline, with circular nodes and a dashed
 * marker on the selected (red) peak. Pure SVG + framer-motion — lightweight.
 */

const BASE = 320;          // baseline y
const EASE = [0.16, 1, 0.3, 1] as const;

// Each peak: apex + base, a gradient id, and a form-in delay.
const PEAKS = [
  { pts: `250,120 110,${BASE} 400,${BASE}`, grad: "g-gray",   delay: 0.15, op: 0.55 },
  { pts: `320,180 190,${BASE} 450,${BASE}`, grad: "g-violet", delay: 0.30, op: 0.55 },
  { pts: `380,80 260,${BASE} 500,${BASE}`,  grad: "g-red",    delay: 0.05, op: 0.80 },
  { pts: `500,145 380,${BASE} 620,${BASE}`, grad: "g-purple", delay: 0.40, op: 0.55 },
  { pts: `590,205 500,${BASE} 680,${BASE}`, grad: "g-light",  delay: 0.55, op: 0.45 },
];

const NODES = [
  { cx: 150, fill: "#B7A8F0" },
  { cx: 265, fill: "#6E63E6" },
  { cx: 380, fill: "#E11D2E", selected: true },
  { cx: 495, fill: "#E7DEF2" },
  { cx: 610, fill: "#B7A8F0" },
];

const GRADS: Record<string, string> = {
  "g-gray": "#C2C7CF",
  "g-violet": "#6E63E6",
  "g-red": "#E11D2E",
  "g-purple": "#8A6BE0",
  "g-light": "#B7A8F0",
};

export function MountainRange({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 760 400" className={className} role="img" aria-label="Distribution of survey cuts">
      <defs>
        {Object.entries(GRADS).map(([id, color]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0.9" />
          </linearGradient>
        ))}
        <radialGradient id="glow" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#E11D2E" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#6E63E6" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft ambient glow */}
      <motion.rect
        x="0" y="0" width="760" height="400" fill="url(#glow)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}
      />

      {/* peaks rise from the baseline */}
      {PEAKS.map((p) => (
        <motion.polygon
          key={p.pts}
          points={p.pts}
          fill={`url(#${p.grad})`}
          initial={reduce ? { opacity: p.op } : { scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: p.op }}
          transition={{ duration: 1, delay: reduce ? 0 : p.delay, ease: EASE }}
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
        />
      ))}

      {/* baseline */}
      <motion.line
        x1="60" y1={BASE} x2="700" y2={BASE}
        stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
      />

      {/* dashed marker on the selected peak */}
      <motion.line
        x1="380" y1="80" x2="380" y2={BASE}
        stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" strokeDasharray="5 6"
        initial={reduce ? { scaleY: 1 } : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.7, delay: 0.9, ease: EASE }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      />

      {/* nodes */}
      {NODES.map((n, i) => (
        <motion.g
          key={n.cx}
          initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: reduce ? 0 : 0.6 + i * 0.08, ease: EASE }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          {n.selected && <circle cx={n.cx} cy={BASE} r="22" fill="none" stroke="#ffffff" strokeWidth="3" />}
          <circle cx={n.cx} cy={BASE} r={n.selected ? 13 : 20} fill={n.fill} />
        </motion.g>
      ))}

      {/* axis value label */}
      <motion.text
        x="694" y="96" textAnchor="end" fontSize="15" fill="#8A8F98"
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1 }}
      >
        1.00
      </motion.text>
    </svg>
  );
}
