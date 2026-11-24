import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { safeInternalRedirect } from "@/lib/safe-redirect";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Auth Callback — Autumic" },
      { name: "description", content: "Auth Callback in the Autumic AI automation platform." },
      { property: "og:title", content: "Auth Callback — Autumic" },
      {
        property: "og:description",
        content: "Auth Callback in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search["next"] === "string" ? { next: search["next"] as string } : {},
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [message, setMessage] = useState("Finishing sign in…");

  useEffect(() => {
    let active = true;

    const finish = async () => {
      // Supabase's browser client automatically consumes the OAuth code from
      // the callback URL when detectSessionInUrl is enabled.
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setMessage(error?.message ?? "We could not complete sign in. Please try again.");
        return;
      }
      const target = safeInternalRedirect(next, window.location.origin);
      if (target) {
        // Full replace so arbitrary validated paths (incl. search/hash) resolve.
        window.location.replace(target);
        return;
      }
      await navigate({ to: "/dashboard", replace: true });
    };

    void finish();
    return () => {
      active = false;
    };
  }, [navigate, next]);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <section className="rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-xl">
        <h1 className="text-xl font-extrabold">Signing you in</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
    </main>
  );
}
