import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { HomeBrand } from "@/components/home-brand";
import { AnimatePresence, motion } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-portal";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/automations", label: "Automations" },
  { to: "/checkout", label: "Pricing" },
  { to: "/security", label: "Security" },
  { to: "/status", label: "Status" },
  { to: "/dashboard", label: "Dashboard" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const { data: user, isLoading } = useCurrentUser();
  const signedIn = !!user;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div aria-hidden className="h-20" />
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 0.9, 0.2, 1] }}
        style={{ top: "var(--banner-h, 0px)" }}
        className="fixed inset-x-0 z-50 px-3 pt-3 sm:px-5"
      >
        <div
          className={cn(
            "relative mx-auto flex h-14 max-w-7xl items-center gap-3 rounded-2xl border px-3 transition-all duration-500 sm:px-4",
            scrolled || open
              ? "border-border/80 bg-background/75 shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--primary)_35%,transparent)] backdrop-blur-2xl"
              : "border-transparent bg-background/30 backdrop-blur-md",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-8 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent transition-opacity duration-500",
              scrolled ? "opacity-100" : "opacity-0",
            )}
          />
          <HomeBrand className="mr-auto lg:mr-0" onNavigate={() => setOpen(false)} />

          <nav
            className="mx-auto hidden items-center gap-1 text-sm font-medium lg:flex"
            onMouseLeave={() => setHovered(null)}
          >
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onMouseEnter={() => setHovered(item.to)}
                className="relative rounded-full px-3.5 py-2 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
              >
                {hovered === item.to && (
                  <motion.span
                    layoutId="nav-hover"
                    className="absolute inset-0 -z-10 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                {item.label}
              </Link>
            ))}
            <a
              href="mailto:antheticplusstudios@gmail.com"
              onMouseEnter={() => setHovered("contact")}
              className="relative rounded-full px-3.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {hovered === "contact" && (
                <motion.span
                  layoutId="nav-hover"
                  className="absolute inset-0 -z-10 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              Contact
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isLoading &&
              (signedIn ? (
                <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
                  <Link to="/dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    My dashboard
                  </Link>
                </Button>
              ) : (
                <>
                  <AuthDialog mode="signin">
                    <Button variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex">
                      Sign in
                    </Button>
                  </AuthDialog>
                  <AuthDialog mode="signup">
                    <Button size="sm" className="hidden rounded-full sm:inline-flex">
                      Get started
                    </Button>
                  </AuthDialog>
                </>
              ))}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={open ? "x" : "m"}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex"
                >
                  {open ? <X /> : <Menu />}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 0.9, 0.2, 1] }}
              className="mx-auto mt-2 grid max-w-7xl gap-1 rounded-2xl border border-border/80 bg-background/90 p-3 shadow-2xl backdrop-blur-2xl lg:hidden"
            >
              {NAV.map((item, i) => (
                <motion.div
                  key={item.to}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i + 0.05 }}
                >
                  <Link
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-base font-semibold transition-colors hover:bg-accent data-[status=active]:bg-accent data-[status=active]:text-primary"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <a
                href="mailto:antheticplusstudios@gmail.com"
                className="block rounded-xl px-4 py-3 text-base font-semibold hover:bg-accent"
              >
                Contact
              </a>
              <div className="mt-2 grid gap-2 border-t border-border pt-3">
                {signedIn ? (
                  <Button asChild className="w-full rounded-full">
                    <Link to="/dashboard" onClick={() => setOpen(false)}>
                      <LayoutDashboard className="h-4 w-4" />
                      My dashboard
                    </Link>
                  </Button>
                ) : (
                  <>
                    <AuthDialog mode="signin">
                      <Button variant="outline" className="w-full rounded-full">
                        Sign in
                      </Button>
                    </AuthDialog>
                    <AuthDialog mode="signup">
                      <Button className="w-full rounded-full">Get started</Button>
                    </AuthDialog>
                  </>
                )}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.header>
    </>
  );
}
