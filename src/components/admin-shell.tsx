import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeDollarSign,
  BarChart3,
  Bot,
  Boxes,
  SlidersHorizontal,
  ChevronRight,
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
  Mail,
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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export const adminNav = [
  {
    label: "Overview",
    to: "/admin",
    group: "Overview",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Search workspace",
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
    label: "Knowledge & sources",
    to: "/admin/knowledge",
    group: "AI & Website Agent",
    icon: BookOpenText,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Website assistants",
    to: "/admin/assistants",
    group: "AI & Website Agent",
    icon: Globe2,
    roles: ["owner", "admin"],
  },
  {
    label: "Publishing",
    to: "/admin/agent-publishing",
    group: "AI & Website Agent",
    icon: Rocket,
    roles: ["owner", "admin"],
  },
  {
    label: "Installation & keys",
    to: "/admin/site-keys",
    group: "AI & Website Agent",
    icon: KeyRound,
    roles: ["owner", "admin"],
  },
  {
    label: "Voice & email",
    to: "/admin/voice-agent",
    group: "AI & Website Agent",
    icon: Sparkles,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "All automations",
    to: "/admin/automations",
    group: "Automations & Workflows",
    icon: Bot,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Manage 4 automations",
    to: "/admin/suite",
    group: "Automations & Workflows",
    icon: Bot,
    roles: ["owner", "admin"],
  },
  {
    label: "Automation API keys",
    to: "/admin/integration-keys",
    group: "Automations & Workflows",
    icon: KeyRound,
    roles: ["owner", "admin"],
  },
  {
    label: "Auto-training",
    to: "/admin/training",
    group: "Automations & Workflows",
    icon: Sparkles,
    roles: ["owner", "admin"],
  },
  {
    label: "Users",
    to: "/admin/users",
    group: "Clients & Operations",
    icon: Users,
    roles: ["owner", "admin"],
  },
  {
    label: "Inbox & email",
    to: "/admin/messages",
    group: "Clients & Operations",
    icon: Mail,
    roles: ["owner", "admin"],
  },
  {
    label: "Lead assignment",
    to: "/admin/automations/round-robin",
    group: "Clients & Operations",
    icon: Users,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Product catalog",
    to: "/admin/catalog",
    group: "Automations & Workflows",
    icon: Boxes,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Solutions",
    to: "/admin/solutions",
    group: "Automations & Workflows",
    icon: Tags,
    roles: ["owner", "admin"],
  },
  {
    label: "Analytics",
    to: "/admin/analytics",
    group: "Clients & Operations",
    icon: BarChart3,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Customers & CRM",
    to: "/admin/crm",
    group: "Clients & Operations",
    icon: Tags,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Subscriptions",
    to: "/admin/lifecycle",
    group: "Finance & Subscriptions",
    icon: Clock,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Plans & pricing",
    to: "/admin/pricing",
    group: "Finance & Subscriptions",
    icon: Sparkles,
    roles: ["owner", "admin", "partner"],
  },
  {
    label: "Providers & failover",
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
    label: "Health monitor",
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
    label: "Conversation diagnostics",
    to: "/admin/diagnostics",
    group: "AI & Website Agent",
    icon: Wand2,
    roles: ["owner", "admin", "partner", "verifier"],
  },
  {
    label: "Platform settings",
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
  const [filter, setFilter] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { data: role } = useRole();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const groupOrder = [
    "Overview",
    "AI & Website Agent",
    "Automations & Workflows",
    "Clients & Operations",
    "Finance & Subscriptions",
    "AI Infrastructure",
    "Platform & Security",
  ];
  const permitted = adminNav.filter((item) =>
    (item.roles as readonly string[]).includes(role ?? ""),
  );
  const nav = permitted
    .filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));
  const active = permitted
    .filter((item) => path === item.to || (item.to !== "/admin" && path.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const initials = (user?.email ?? "A").slice(0, 2).toUpperCase();
  async function signOut() {
    setSigningOut(true);
    try {
      await qc.cancelQueries();
      qc.clear();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Sign out failed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  const navigation = (
    <>
      <div className="px-2 pb-6 pt-2">
        <HomeBrand />
      </div>
      <div className="mb-5 flex items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Boxes className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">AntheticPlus workspace</p>
          <p className="mt-1 text-[11px] capitalize text-muted-foreground">
            {role ?? "Checking access"}
          </p>
        </div>
      </div>
      <label className="mb-3 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-muted-foreground">
        <Search className="size-3.5" />
        <input
          aria-label="Find navigation"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a page…"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
      </label>
      <nav aria-label="Admin" className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto">
        {nav.map((item, index) => (
          <div key={item.to}>
            {item.group !== nav[index - 1]?.group && (
              <p className="px-3 pb-2 pt-5 text-[10px] font-medium uppercase text-muted-foreground">
                {item.group === "AI & Website Agent"
                  ? "Assistants"
                  : item.group === "Automations & Workflows"
                    ? "Automations"
                    : item.group === "Finance & Subscriptions"
                      ? "Billing"
                      : item.group}
              </p>
            )}
            <Link
              to={item.to}
              onClick={() => setOpen(false)}
              className="line-nav-item flex items-center gap-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-active={active?.to === item.to}
              aria-current={active?.to === item.to ? "page" : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          </div>
        ))}
        {!nav.length && (
          <p className="px-3 py-6 text-xs text-muted-foreground">No matching pages.</p>
        )}
      </nav>
      <div className="mt-4 border-t border-border pt-4">
        <Button asChild variant="ghost" className="w-full justify-start text-muted-foreground">
          <Link to="/dashboard">
            <ArrowLeft /> Client dashboard
          </Link>
        </Button>
        <div className="mt-3 flex items-center gap-3 px-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs">{user?.email}</p>
            <p className="text-[10px] capitalize text-muted-foreground">{role}</p>
          </div>
          <Button
            title="Sign out"
            aria-label="Sign out"
            variant="ghost"
            size="icon"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </>
  );
  return (
    <div className="admin-workspace min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-sidebar p-4 lg:flex">
        {navigation}
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="admin-workspace flex w-72 flex-col bg-sidebar p-4">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">Choose an administration page</SheetDescription>
          {navigation}
        </SheetContent>
      </Sheet>
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border workspace-header px-4 sm:px-8">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            className="lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-xs">
            <Link to="/admin" className="text-muted-foreground">
              Workspace
            </Link>
            <ChevronRight className="size-3 text-muted-foreground" />
            <span className="truncate font-medium">{active?.label ?? "Details"}</span>
            {active && path !== active.to && (
              <>
                <ChevronRight className="size-3 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  {decodeURIComponent(path.split("/").pop() ?? "Details").replaceAll("-", " ")}
                </span>
              </>
            )}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="icon" title="Global search">
              <Link to="/admin/search" aria-label="Global search">
                <Search />
              </Link>
            </Button>
            <AssistantPanel />
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
