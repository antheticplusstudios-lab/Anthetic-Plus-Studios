import { motion, useReducedMotion } from "motion/react";

const BLOCKS = [
  { x: "4%", y: "14%", w: "13rem", h: "13rem", d: 0.0, r: -9 },
  { x: "70%", y: "8%", w: "10rem", h: "10rem", d: 0.7, r: 8 },
  { x: "47%", y: "42%", w: "17rem", h: "17rem", d: 1.2, r: -5 },
  { x: "78%", y: "57%", w: "12rem", h: "12rem", d: 0.35, r: 12 },
  { x: "18%", y: "67%", w: "9rem", h: "9rem", d: 1.5, r: 6 },
];

export function BlockDrift() {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.08),transparent_42%)]" />
      {BLOCKS.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-[2rem] border border-white/[0.055] bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-[1px]"
          style={{ left: b.x, top: b.y, width: b.w, height: b.h, rotate: b.r }}
          initial={{ opacity: 0, scale: 0.92, y: 18 }}
          animate={
            reduced
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: [0.15, 0.34, 0.15], y: [0, -18, 0], rotate: [b.r, b.r + 3, b.r] }
          }
          transition={
            reduced
              ? { duration: 0.3 }
              : { duration: 8 + i * 1.5, delay: 0.35 + b.d, repeat: Infinity, ease: "easeInOut" }
          }
        />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.72)_88%)]" />
    </div>
  );
}
