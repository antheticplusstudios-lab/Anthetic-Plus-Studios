import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, ChevronLeft, CreditCard, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
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

  return (
    <div className="min-h-screen bg-muted/25">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-background p-4 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-8 flex items-center justify-between">
          <HomeBrand />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)}>
            <ChevronLeft />
          </Button>
        </div>
        <nav className="grid gap-1.5">
          {clientNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to)) ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
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
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" title="Sign out" onClick={() => void supabase.auth.signOut()}>
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
