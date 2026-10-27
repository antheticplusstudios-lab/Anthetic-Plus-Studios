import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
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

const base = buttonVariants({ variant: "hero", size: "xl" });

export function MovingGradientButton({ children, href, to, className = "", icon }: Props) {
  const content = (
    <>
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
