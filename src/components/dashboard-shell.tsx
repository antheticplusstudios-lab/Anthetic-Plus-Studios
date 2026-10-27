import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  ChevronLeft,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LanguagePicker } from "@/components/site-header";
import { HomeBrand } from "@/components/home-brand";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useRole } from "@/hooks/use-portal";
import { supabase } from "@/integrations/supabase/client";

const clientNav = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
  { label: "My Automations", to: "/dashboard/automations", icon: Bot },
  { label: "My Orders", to: "/dashboard/orders", icon: CreditCard },
  { label: "Subscription Payments", to: "/dashboard/payments", icon: CreditCard },
  { label: "Profile Settings", to: "/dashboard/profile", icon: UserRound },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { data: role } = useRole();
  const { data: user } = useCurrentUser();
  const staff = !!role && role !== "client";
  const initial = (user?.email ?? "S").charAt(0).toUpperCase();

  const navigation = (
    <>
      {" "}
      <div className="mb-8 flex items-center justify-between">
        <HomeBrand />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close navigation"
          className="lg:hidden"
          onClick={() => setOpen(false)}
        >
          <ChevronLeft />
        </Button>
      </div>
      <nav aria-label="Dashboard" className="line-nav grid gap-1.5">
        {clientNav.map((item) => {
          const active = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className={`line-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {staff && (
          <Link
            to={role === "verifier" ? "/admin/verification" : "/admin"}
            onClick={() => setOpen(false)}
            className="mt-4 flex items-center gap-3 rounded-xl border border-primary/25 bg-secondary px-3 py-2.5 text-sm font-extrabold text-primary"
          >
            <ShieldCheck className="h-4 w-4" />
            Admin Control Center
          </Link>
        )}
      </nav>
      <div className="absolute inset-x-4 bottom-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <strong className="block text-foreground">Need help?</strong>antheticplusstudios@gmail.com
      </div>
    </>
  );
  return (
    <div className="customer-workspace min-h-screen bg-muted/25">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 overflow-y-auto border-r border-border bg-sidebar p-4 pb-24 lg:block">
        {navigation}
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-4 pb-24">
          <SheetTitle className="sr-only">Dashboard navigation</SheetTitle>
          <SheetDescription className="sr-only">Choose a workspace page</SheetDescription>
          {navigation}
        </SheetContent>
      </Sheet>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border workspace-header px-4 sm:px-8">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            className="lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <LanguagePicker />
            <Button
              variant="ghost"
              size="icon"
              title="Sign out"
              aria-label="Sign out"
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
