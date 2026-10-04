import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useProfile } from "@/hooks/use-portal";

export function ProfileGate({ children }: { children: ReactNode }) {
  const { data: profile, isLoading } = useProfile();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const completed = !!profile?.profile_completed;
  const onProfilePage = path.startsWith("/dashboard/profile");
  const locked = !isLoading && !completed && !onProfilePage;

  return (
    <>
      {!isLoading && !completed && (
        <div className="sticky top-16 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b border-foreground/30 bg-foreground/12 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
          <TriangleAlert className="h-4 w-4 shrink-0 text-foreground" />
          <p className="text-sm font-bold">
            Complete your company profile to unlock ordering, your dashboard and your embed script.
          </p>
          <Link
            to="/dashboard/profile"
            className="inline-flex items-center gap-1 text-sm font-extrabold text-primary hover:underline"
          >
            Complete now <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      <div className="relative">
        <div className={locked ? "pointer-events-none select-none blur-[6px]" : undefined} aria-hidden={locked}>
          {children}
        </div>
        {locked && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="max-w-md rounded-3xl border border-border bg-card/85 p-8 text-center shadow-2xl backdrop-blur-xl">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-foreground/15">
                <TriangleAlert className="h-6 w-6 text-foreground" />
              </div>
              <h2 className="mt-5 text-xl font-extrabold">Profile required</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We need your company name, target domain, contact email and business category before your automations
                can be locked to your website.
              </p>
              <Link
                to="/dashboard/profile"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-extrabold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5"
              >
                Complete profile <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
