"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

/** Scroll-triggered fade-up reveal (runs once when it enters the viewport). */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  ...rest
}: { children: React.ReactNode; delay?: number; y?: number; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
