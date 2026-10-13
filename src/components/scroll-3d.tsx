import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * Section that rises out of the page in 3D as it scrolls into view and tips
 * gently away as it leaves. Driven by scroll position (not a one-off timer),
 * so motion always follows the reader.
 */
export function Scroll3D({
  children,
  className,
  intensity = 1,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  const rotateX = useTransform(p, [0, 0.35, 0.7, 1], [16 * intensity, 0, 0, -8 * intensity]);
  const scale = useTransform(p, [0, 0.35, 0.7, 1], [0.9, 1, 1, 0.96]);
  const y = useTransform(p, [0, 0.35, 0.7, 1], [90 * intensity, 0, 0, -40 * intensity]);
  const opacity = useTransform(p, [0, 0.22, 0.85, 1], [0, 1, 1, 0.35]);

  if (reduced) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ perspective: 1400 }}>
      <motion.div style={{ rotateX, scale, y, opacity, transformOrigin: "50% 0%" }}>
        {children}
      </motion.div>
    </div>
  );
}

/** Hero content that lifts, tilts and fades as the visitor scrolls past it. */
export function HeroDepth({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [0, 14]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ perspective: 1200 }}>
      <motion.div style={{ y, rotateX, scale, opacity, transformOrigin: "50% 100%" }}>
        {children}
      </motion.div>
    </div>
  );
}

/** Element that floats on its own depth layer (for the hero console card). */
export function DepthFloat({
  children,
  className,
  depth = 60,
}: {
  children: ReactNode;
  className?: string;
  depth?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [depth, -depth]);
  const rotateY = useTransform(scrollYProgress, [0, 0.5, 1], [-10, 0, 8]);
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ perspective: 1200 }}>
      <motion.div style={{ y, rotateY }}>{children}</motion.div>
    </div>
  );
}

/** Thin reading-progress bar pinned to the top of the page. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  return <motion.div aria-hidden className="scroll-progress" style={{ scaleX }} />;
}
