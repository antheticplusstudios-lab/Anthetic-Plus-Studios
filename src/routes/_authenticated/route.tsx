import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({
    meta: [
      { title: "Route — Autumic" },
      { name: "description", content: "Route in the Autumic AI automation platform." },
      { property: "og:title", content: "Route — Autumic" },
      { property: "og:description", content: "Route in the Autumic AI automation platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  // Signed-out visitors are sent to sign-in from the component rather than by throwing
  // redirect() in beforeLoad: with ssr:false, a beforeLoad redirect during the first
  // client hydration crashes TanStack's match tree (React #520/#422, "reading routeId").
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    return { user: error ? null : (data.user ?? null) };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  // Capture the protected URL once: this layout can stay mounted while the
  // navigation to /auth settles, and re-reading the location would chain redirects.
  const location = useLocation();
  const target = useRef(location.href);
  const sent = useRef(false);
  const onAuthPage = location.pathname.startsWith("/auth");
  useEffect(() => {
    if (user || sent.current || onAuthPage) return;
    sent.current = true;
    void navigate({
      to: "/auth",
      search: { redirect: target.current, mode: "signin" },
      replace: true,
    });
  }, [user, navigate, onAuthPage]);
  if (!user) return null;
  return <Outlet />;
}
