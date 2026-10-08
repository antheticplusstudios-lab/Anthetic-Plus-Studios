import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type Props =
  | {
      children: ReactNode;
      href?: never;
      to: string;
      className?: string;
      icon?: ReactNode;
    }
  | {
      children: ReactNode;
      href: string;
      to?: never;
      className?: string;
      icon?: ReactNode;
    };

const base =
  "group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-white px-6 py-3 text-sm font-extrabold text-black shadow-[0_12px_40px_rgba(255,255,255,0.10)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(255,255,255,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export function MovingGradientButton({ children, href, to, className = "", icon }: Props) {
  const content = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.95)_45%,rgba(220,220,220,0.75)_52%,transparent_75%)] transition-transform duration-1000 ease-out group-hover:translate-x-full"
      />
      <span className="relative">{children}</span>
      {icon ?? (
        <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to as never} className={`${base} ${className}`}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={`${base} ${className}`}>
      {content}
    </a>
  );
}
