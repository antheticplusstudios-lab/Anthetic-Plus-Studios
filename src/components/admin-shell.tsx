import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeDollarSign,
  BarChart3,
  Bot,
  Boxes,
  SlidersHorizontal,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ServerCog,
  ShieldAlert,
  Sparkles,
  Tags,
  Users,
  Wand2,
  BookOpenText,
  Globe2,
  KeyRound,
  Rocket,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { HomeBrand } from "@/components/home-brand";
import { AssistantPanel } from "@/components/assistant-panel";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useRole } from "@/hooks/use-portal";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const adminNav = [
  {
    label: "Command Center",
    to: "/admin",
    group: "Overview",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Global Search",
    to: "/admin/search",
    group: "Overview",
    icon: Search,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Emergency Controls",
    to: "/admin/emergency",
    group: "Platform & Security",
    icon: ShieldAlert,
    roles: ["owner"],
  },
  {
    label: "Orders Ledger",
    to: "/admin/orders",
    group: "Finance & Subscriptions",
    icon: BadgeDollarSign,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Verification Queue",
    to: "/admin/verification",
    group: "Finance & Subscriptions",
    icon: ClipboardCheck,
    roles: ["owner", "admin", "partner", "verifier"],
  },
  {
    label: "Capability Requests",
    to: "/admin/capability-requests",
    group: "Automations & Workflows",
    icon: ClipboardCheck,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Automation Creator",
    to: "/admin/creator",
    group: "Automations & Workflows",
    icon: Wand2,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Agent Knowledge & Learning",
    to: "/admin/knowledge",
    group: "AI & Website Agent",
    icon: BookOpenText,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Website AI Agent (Text + Voice)",
    to: "/admin/assistants",
    group: "AI & Website Agent",
    icon: Globe2,
    roles: ["owner", "admin"],
  },
  {
    label: "Website Agent: Draft & Publish",
    to: "/admin/agent-publishing",
    group: "AI & Website Agent",
    icon: Rocket,
    roles: ["owner", "admin"],
  },
  {
    label: "Website Installation Keys",
    to: "/admin/site-keys",
    group: "AI & Website Agent",
    icon: KeyRound,
    roles: ["owner", "admin"],
  },
  {
    label: "Voice Channel & Email",
    to: "/admin/voice-agent",
    group: "AI & Website Agent",
    icon: Sparkles,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Automations Overview",
    to: "/admin/automations",
    group: "Automations & Workflows",
    icon: Bot,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "CRM Lead Assignment (Round-Robin)",
    to: "/admin/automations/round-robin",
    group: "Clients & Operations",
    icon: Users,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Automation Product Catalog",
    to: "/admin/catalog",
    group: "Automations & Workflows",
    icon: Boxes,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Analytics",
    to: "/admin/analytics",
    group: "Clients & Operations",
    icon: BarChart3,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Client CRM & Tags",
    to: "/admin/crm",
    group: "Clients & Operations",
    icon: Tags,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Subscription Lifecycle",
    to: "/admin/lifecycle",
    group: "Finance & Subscriptions",
    icon: Clock,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Pricing Configurator",
    to: "/admin/pricing",
    group: "Finance & Subscriptions",
    icon: Sparkles,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "AI Keys, Rotation & Failover",
    to: "/admin/infrastructure",
    group: "AI Infrastructure",
    icon: ServerCog,
    roles: ["owner"],
  },
  {
    label: "Team & Audit Trail",
    to: "/admin/team",
    group: "Platform & Security",
    icon: Users,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Automation Health Monitor",
    to: "/admin/receptionist",
    group: "Automations & Workflows",
    icon: Bot,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Payment Methods",
    to: "/admin/payment-methods",
    group: "Finance & Subscriptions",
    icon: BadgeDollarSign,
    roles: ["owner"],
  },
  {
    label: "Agent Conversation Diagnostics",
    to: "/admin/diagnostics",
    group: "AI & Website Agent",
    icon: Wand2,
    roles: ["owner", "admin", "partner", "verifier"],
  },
  {
    label: "System Settings",
    to: "/admin/settings",
    group: "Platform & Security",
    icon: SlidersHorizontal,
    roles: ["owner"],
  },
] as const;

type AdminNavItem = (typeof adminNav)[number];
function adminNavGroup(item: AdminNavItem): string {
  return item.group;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { data: role } = useRole();
  const { data: user } = useCurrentUser();
  const groupOrder = [
    "Overview",
    "AI & Website Agent",
    "Automations & Workflows",
    "AI Infrastructure",
    "Clients & Operations",
    "Finance & Subscriptions",
    "Platform & Security",
  ];
  const nav = adminNav
    .filter((item) => (item.roles as readonly string[]).includes(role ?? ""))
    .sort((a, b) => groupOrder.indexOf(adminNavGroup(a)) - groupOrder.indexOf(adminNavGroup(b)));
  const initial = (user?.email ?? "A").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-background p-4 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <HomeBrand />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)}>
            <ChevronLeft />
          </Button>
        </div>
        <div className="mb-5 rounded-xl border border-primary/25 bg-secondary px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Signed in as
          </p>
          <p className="truncate text-sm font-extrabold capitalize text-primary">
            {role === "partner" ? "Partner" : role}
          </p>
        </div>
        <nav
          aria-label="Admin"
          className="line-nav grid min-h-0 flex-1 content-start gap-1 overflow-y-auto"
        >
          {nav.map((item, index) => {
            const matches = (to: string) =>
              path === to || (to !== "/admin" && path.startsWith(`${to}/`));
            const best = nav
              .filter((n) => matches(n.to))
              .sort((a, b) => b.to.length - a.to.length)[0];
            const active = best?.to === item.to;
            const group = adminNavGroup(item);
            const previousGroup = index > 0 ? adminNavGroup(nav[index - 1]!) : null;
            return (
              <div key={item.to} className="contents">
                {group !== previousGroup && (
                  <p className="mt-3 border-t border-border px-3 pb-1 pt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground first:mt-0 first:border-t-0 first:pt-1">
                    {group}
                  </p>
                )}
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "line-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>
        <Link
          to="/dashboard"
          onClick={() => setOpen(false)}
          className="mt-3 flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Client dashboard
        </Link>
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
              <Menu />
            </Button>
            <p className="hidden text-sm font-bold text-muted-foreground sm:block">
              AntheticPlus Studios · Control Center
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <AssistantPanel />
            <Button
              variant="ghost"
              size="icon"
              title="Sign out"
              onClick={() => void supabase.auth.signOut()}
            >
              <LogOut />
            </Button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
              {initial}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
