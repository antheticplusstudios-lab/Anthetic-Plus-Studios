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
    icon: LayoutDashboard,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Global Search",
    to: "/admin/search",
    icon: Search,
    roles: ["owner", "admin", "partner"],
  },
  { label: "Emergency Controls", to: "/admin/emergency", icon: ShieldAlert, roles: ["owner"] },
  {
    label: "Orders Ledger",
    to: "/admin/orders",
    icon: BadgeDollarSign,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Verification Queue",
    to: "/admin/verification",
    icon: ClipboardCheck,
    roles: ["owner", "admin", "partner", "verifier"],
  },
  {
    label: "Automation Creator",
    to: "/admin/creator",
    icon: Wand2,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Knowledge Drafts",
    to: "/admin/knowledge",
    icon: BookOpenText,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "AI Assistants (AntheticPlus)",
    to: "/admin/assistants",
    icon: Globe2,
    roles: ["owner", "admin"],
  },
  {
    label: "AI Voice Agent",
    to: "/admin/voice-agent",
    icon: Sparkles,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Automations & Transcripts",
    to: "/admin/automations",
    icon: Bot,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Round-Robin",
    to: "/admin/automations/round-robin",
    icon: Users,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "All Automations",
    to: "/admin/catalog",
    icon: Boxes,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Analytics",
    to: "/admin/analytics",
    icon: BarChart3,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Client CRM & Tags",
    to: "/admin/crm",
    icon: Tags,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Subscription Lifecycle",
    to: "/admin/lifecycle",
    icon: Clock,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Pricing Configurator",
    to: "/admin/pricing",
    icon: Sparkles,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Infrastructure & Groq Pool",
    to: "/admin/infrastructure",
    icon: ServerCog,
    roles: ["owner"],
  },
  {
    label: "Team & Audit Trail",
    to: "/admin/team",
    icon: Users,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Live Automations",
    to: "/admin/receptionist",
    icon: Bot,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Payment Methods",
    to: "/admin/payment-methods",
    icon: BadgeDollarSign,
    roles: ["owner"],
  },
  { label: "AI Key Pool", to: "/admin/llm-keys", icon: ServerCog, roles: ["owner"] },
  {
    label: "Conversation Diagnostics",
    to: "/admin/diagnostics",
    icon: Wand2,
    roles: ["owner", "admin", "partner", "verifier"],
  },
  { label: "System Settings", to: "/admin/settings", icon: SlidersHorizontal, roles: ["owner"] },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { data: role } = useRole();
  const { data: user } = useCurrentUser();
  const nav = adminNav.filter((item) => (item.roles as readonly string[]).includes(role ?? ""));
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
          {nav.map((item) => {
            const active = path === item.to || (item.to !== "/admin" && path.startsWith(item.to));
            return (
              <Link
                key={item.to}
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
