import { motion, useReducedMotion, AnimatePresence, type Variants } from "motion/react";
import type { ReactNode } from "react";

/** Custom easing — a slightly overshooting, confident glide. */
export const glide = [0.22, 0.9, 0.2, 1] as const;
export const soft = [0.4, 0.14, 0.2, 1] as const;

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
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.62, delay, ease: glide }}
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
  hidden: { opacity: 0, y: 18, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: glide } },
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
        initial={{ opacity: 0, x: direction * 34, filter: "blur(4px)" }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, x: direction * -28, filter: "blur(4px)" }}
        transition={{ duration: 0.34, ease: soft }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export { motion, AnimatePresence, useReducedMotion };
