import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ElementType } from "react";

type Props = {
  text: string;
  tag?: ElementType;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  stagger?: number;
};

export function RollingLetters({
  text,
  tag: Tag = "h1",
  className = "",
  style,
  delay = 0.08,
  stagger = 0.035,
}: Props) {
  const reduced = useReducedMotion();
  const chars = Array.from(text);

  if (reduced)
    return (
      <Tag className={className} style={style}>
        {text}
      </Tag>
    );

  return (
    <Tag className={`overflow-hidden ${className}`} style={style}>
      {text.split(" ").map((word, w, words) => {
        const start = words.slice(0, w).reduce((n, x) => n + x.length + 1, 0);
        return (
          <span key={`${word}-${w}`} className="inline-block whitespace-nowrap">
            {Array.from(word).map((char, i) => {
              const index = start + i;
              return (
                <motion.span
                  key={`${char}-${index}`}
                  className="inline-block"
                  initial={{ y: "115%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  transition={{
                    duration: 0.72,
                    delay: delay + Math.abs(index - (chars.length - 1) / 2) * stagger,
                    ease: [0.22, 0.9, 0.2, 1],
                  }}
                >
                  {char}
                </motion.span>
              );
            })}
            {w < words.length - 1 && "\u00A0"}
          </span>
        );
      })}
    </Tag>
  );
}
