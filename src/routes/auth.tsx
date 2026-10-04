import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { AuthPanel } from "@/components/auth-dialog";
import { motion } from "@/components/motion";

export const Route = createFileRoute("/auth")({
  // Both params are optional so plain <Link to="/auth"> works from anywhere on the site.
  validateSearch: (search: Record<string, unknown>): { redirect?: string; mode?: "signup" | "signin" } => ({
    ...(typeof search["redirect"] === "string" ? { redirect: search["redirect"] as string } : {}),
    mode: search["mode"] === "signup" ? ("signup" as const) : ("signin" as const),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — AntheticPlus Studios" },
      { name: "description", content: "Access your AntheticPlus automation workspace." },
      { property: "og:title", content: "AntheticPlus Studios Sign In" },
      { property: "og:description", content: "Access your AI automation workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect, mode } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/30">
      <SiteHeader />
      <main className="grid place-items-center px-4 py-12">
        <motion.section
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.55, ease: [0.22, 0.9, 0.2, 1] }}
          className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8"
        >
          <AuthPanel
            initialMode={mode ?? "signin"}
            onDone={() => {
              if (redirect) window.location.replace(redirect);
              else void navigate({ to: "/dashboard" });
            }}
          />
        </motion.section>
      </main>
    </div>
  );
}
