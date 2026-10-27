import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({
    meta: [
      { title: "Route — AntheticPlus Studios" },
      { name: "description", content: "Route in the AntheticPlus AI automation platform." },
      { property: "og:title", content: "Route — AntheticPlus Studios" },
      { property: "og:description", content: "Route in the AntheticPlus AI automation platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href, mode: "signin" } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
