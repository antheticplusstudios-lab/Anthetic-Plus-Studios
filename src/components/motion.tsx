import { motion, useReducedMotion, AnimatePresence, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useScrollReveal } from "@/components/scroll-reveal";

/** Material 3 emphasized and standard easing, paired with the CSS tokens. */
export const glide = [0.05, 0.7, 0.1, 1] as const;
export const soft = [0.2, 0, 0, 1] as const;

/** Path-only key: fresh entrances without remounting on query/auth updates. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const reduced = useReducedMotion();
  useScrollReveal(pathname);
  return (
    <motion.div
      key={pathname}
      className="route-entrance"
      initial={reduced ? false : { opacity: 0.92 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.35, ease: glide }}
    >
      {children}
    </motion.div>
  );
}

export function Entrance({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 1, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay, ease: glide }}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 1, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: glide }}
    >
      {children}
    </motion.div>
  );
}

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const riseItem: Variants = {
  hidden: { opacity: 1, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: glide } },
};

export function StaggerGroup({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-70px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={riseItem}>
      {children}
    </motion.div>
  );
}

/** Card that lifts and tilts its shadow subtly on hover — pointer devices only. */
export function LiftCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ y: -6, scale: 1.012 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.6 }}
    >
      {children}
    </motion.div>
  );
}

/** Horizontal slide used between multi-step flows. */
export function StepSlide({
  stepKey,
  direction,
  children,
}: {
  stepKey: string | number;
  direction: 1 | -1;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div>{children}</div>;
  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        initial={{ opacity: 0, x: direction * 34 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -28 }}
        transition={{ duration: 0.34, ease: soft }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export { motion, AnimatePresence, useReducedMotion };
