import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { Entrance } from "@/components/motion";
import { Hero3D } from "@/components/hero-3d";

/** Shared marketing chrome: header, page body, footer. */
export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("hero-bg glow-blend relative overflow-hidden", className)}>
      <Hero3D />
      <div className="container-page relative py-16 sm:py-20">
        <Entrance className="max-w-3xl">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="h-display mt-5">{title}</h1>
          <p className="lead mt-5 max-w-2xl">{lead}</p>
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </Entrance>
      </div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 className={cn("h-section", eyebrow && "mt-4")}>{title}</h2>
      {lead && <p className="lead mt-4">{lead}</p>}
    </div>
  );
}
