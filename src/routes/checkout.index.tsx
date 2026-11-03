import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/checkout/")({
  head: () => ({
    meta: [
      { title: "Custom Automation Proposals — Autumic" },
      {
        name: "description",
        content: "Talk to Autumic about a custom AI automation package for your business.",
      },
      { property: "og:title", content: "Custom Automation Proposals — Autumic" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container-page grid min-h-[65vh] items-center gap-10 py-20 lg:grid-cols-[1.1fr_.9fr]">
        <section>
          <span className="eyebrow">{t("Custom packages", "কাস্টম প্যাকেজ")}</span>
          <h1 className="h-display mt-5">
            {t(
              "Your business is not a one-size-fits-all price tag.",
              "আপনার ব্যবসার জন্য এক মাপের মূল্যতালিকা নয়।",
            )}
          </h1>
          <p className="lead mt-5">
            {t(
              "Autumic scopes each automation around your goals, workflows, channels and existing tools. We’ll start with a free consultation, understand what needs to change, and prepare a proposal for your requirements.",
              "Autumic আপনার লক্ষ্য, ওয়ার্কফ্লো, যোগাযোগের মাধ্যম ও ব্যবহৃত টুল অনুযায়ী অটোমেশনের পরিধি নির্ধারণ করে। বিনামূল্যে পরামর্শ দিয়ে শুরু করে আপনার প্রয়োজন বুঝে প্রস্তাব তৈরি করব।",
            )}
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/contact">
              {t("Book a free consultation", "বিনামূল্যে পরামর্শ নিন")} <ArrowRight />
            </Link>
          </Button>
        </section>
        <aside className="surface-card space-y-5 p-7">
          <h2 className="text-xl font-semibold">
            {t("Talk to Autumic", "Autumic-এর সঙ্গে কথা বলুন")}
          </h2>
          <a
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground"
            href="mailto:info@autumic.com"
          >
            <Mail className="size-4 text-primary" />
            info@autumic.com
          </a>
          <a
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground"
            href="tel:+8801915349394"
          >
            <Phone className="size-4 text-primary" />
            +880 1915-349394
          </a>
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            <MapPin className="size-4 text-primary" />
            Baridhara, Dhaka-1212, Bangladesh
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/automations">
              {t("Explore automation solutions", "অটোমেশন সমাধান দেখুন")}
            </Link>
          </Button>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
