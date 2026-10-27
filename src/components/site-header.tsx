import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, Globe, LayoutDashboard, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { HomeBrand } from "@/components/home-brand";
import { AnimatePresence, motion, useReducedMotion, glide } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-portal";
import { cn } from "@/lib/utils";
import { useLang, useT, type Lang } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Real routes only. "Products" = automations catalog, "Pricing" = checkout plans. */
const NAV = [
  { to: "/", en: "Home", bn: "হোম", exact: true },
  { to: "/automations", en: "Products", bn: "প্রোডাক্ট", exact: false },
  { to: "/checkout", en: "Pricing", bn: "মূল্য", exact: false },
  { to: "/docs", en: "Docs", bn: "ডকস", exact: false },
  { to: "/about", en: "About", bn: "আমাদের কথা", exact: false },
] as const;

const LANGS: { code: Lang; short: string; label: string }[] = [
  { code: "en", short: "EN", label: "English" },
  { code: "bn", short: "বাং", label: "বাংলা" },
];

export function LanguagePicker({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  const t = useT();
  const current = LANGS.find((l) => l.code === lang) ?? {
    code: "en",
    short: "EN",
    label: "English",
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("Change language", "ভাষা পরিবর্তন করুন")}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-body transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Globe className="h-4 w-4" />
        {current.short}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLang(l.code)}
            className="justify-between"
          >
            <span lang={l.code}>{l.label}</span>
            {l.code === lang && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const linkCls =
  "relative rounded-lg px-3 py-2 text-sm font-semibold text-body transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:text-primary";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: user, isLoading } = useCurrentUser();
  const t = useT();
  const signedIn = !!user;
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div aria-hidden="true" className="h-24" />
      <motion.header
        initial={reduced ? false : { y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.4, ease: glide }}
        className="floating-navigation fixed inset-x-3 z-50 mx-auto max-w-7xl rounded-2xl glass-navigation border transition-[background-color,box-shadow,border-color] duration-300 ease-[var(--ease-m3-emphasized)] sm:inset-x-5"
        data-scrolled={scrolled || open || undefined}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3 sm:px-5">
          <HomeBrand className="mr-auto lg:mr-0" onNavigate={() => setOpen(false)} />

          <nav aria-label="Main" className="mx-auto hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className={cn(linkCls, "group")}
              >
                {t(item.en, item.bn)}
                <span
                  aria-hidden
                  className="absolute inset-x-4 -bottom-0.5 mx-auto h-0.5 w-0 rounded-full bg-primary transition-all duration-300 group-data-[status=active]:w-5"
                />
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LanguagePicker />
            {!isLoading &&
              (signedIn ? (
                <Button
                  asChild
                  variant="hero"
                  size="sm"
                  className="hidden h-10 px-5 sm:inline-flex"
                >
                  <Link to="/dashboard">
                    <LayoutDashboard /> {t("Dashboard", "ড্যাশবোর্ড")}
                  </Link>
                </Button>
              ) : (
                <>
                  <AuthDialog mode="signin">
                    <Button variant="pill" size="sm" className="hidden h-10 px-5 sm:inline-flex">
                      {t("Sign In", "সাইন ইন")}
                    </Button>
                  </AuthDialog>
                  <AuthDialog mode="signup">
                    <Button variant="hero" size="sm" className="hidden h-10 px-5 sm:inline-flex">
                      {t("Get Started", "শুরু করুন")} <ArrowRight />
                    </Button>
                  </AuthDialog>
                </>
              ))}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? t("Close menu", "মেনু বন্ধ করুন") : t("Open menu", "মেনু খুলুন")}
              aria-expanded={open}
              aria-controls="mobile-nav"
            >
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              id="mobile-nav"
              aria-label="Mobile"
              initial={reduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -8 }}
              transition={{ duration: reduced ? 0 : 0.25, ease: glide }}
              className="mx-3 mb-3 grid max-h-[calc(100dvh-8rem)] gap-1 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-elevated lg:hidden"
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-accent data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
                >
                  {t(item.en, item.bn)}
                </Link>
              ))}
              <div className="mt-2 grid gap-2 border-t border-border pt-3">
                {signedIn ? (
                  <Button asChild variant="hero" className="h-11 w-full">
                    <Link to="/dashboard" onClick={() => setOpen(false)}>
                      <LayoutDashboard /> {t("Dashboard", "ড্যাশবোর্ড")}
                    </Link>
                  </Button>
                ) : (
                  <>
                    <AuthDialog mode="signin">
                      <Button variant="pill" className="h-11 w-full">
                        {t("Sign In", "সাইন ইন")}
                      </Button>
                    </AuthDialog>
                    <AuthDialog mode="signup">
                      <Button variant="hero" className="h-11 w-full">
                        {t("Get Started", "শুরু করুন")}
                      </Button>
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
