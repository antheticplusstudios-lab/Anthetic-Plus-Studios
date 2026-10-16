import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
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
      await navigate({ to: "/dashboard", replace: true });
    };

    void finish();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <section className="rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-xl">
        <h1 className="text-xl font-extrabold">Signing you in</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
    </main>
  );
}
