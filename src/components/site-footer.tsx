import { Link } from "@tanstack/react-router";
import { Activity, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HomeBrand } from "@/components/home-brand";
import { livePricingQueryOptions, storefrontItems } from "@/lib/pricing";
import { Reveal } from "@/components/motion";
import { useT } from "@/lib/i18n";

function UtcClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{now ? `${now} UTC` : "—"}</span>;
}

export function StatusPill() {
  const t = useT();
  return (
    <Link
      to="/status"
      className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/20"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      {t("System status", "সিস্টেম স্ট্যাটাস")}
    </Link>
  );
}

const linkCls = "transition-colors hover:text-primary";

export function SiteFooter() {
  const t = useT();
  const { data: plans } = useQuery(livePricingQueryOptions);
  const suite = storefrontItems(plans);

  const Col = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3 text-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">{title}</p>
      <ul className="space-y-2 text-body">{children}</ul>
    </div>
  );

  return (
    <footer className="border-t border-border bg-surface py-14">
      <Reveal className="container-page">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <HomeBrand />
            <p className="max-w-xs text-sm text-body">
              {t(
                "AI assistants, multilingual voice and workflow automation for businesses that never want to miss a customer.",
                "যেসব ব্যবসা একজন গ্রাহককেও হারাতে চায় না, তাদের জন্য AI অ্যাসিস্ট্যান্ট, বহুভাষিক ভয়েস ও ওয়ার্কফ্লো অটোমেশন।",
              )}
            </p>
            <StatusPill />
          </div>

          <Col title={t("Products", "প্রোডাক্ট")}>
            {suite.map((s) => (
              <li key={s.slug}>
                <Link to="/automations/$slug" params={{ slug: s.slug }} className={linkCls}>
                  {s.name}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/automations" className={linkCls}>
                {t("All products", "সব প্রোডাক্ট")}
              </Link>
            </li>
            <li>
              <Link to="/checkout" className={linkCls}>
                {t("Pricing", "মূল্য")}
              </Link>
            </li>
          </Col>

          <Col title={t("Company", "কোম্পানি")}>
            <li>
              <Link to="/about" className={linkCls}>
                {t("About", "আমাদের কথা")}
              </Link>
            </li>
            <li>
              <Link to="/contact" className={linkCls}>
                {t("Contact", "যোগাযোগ")}
              </Link>
            </li>
          </Col>

          <Col title={t("Resources", "রিসোর্স")}>
            <li>
              <Link to="/docs" className={linkCls}>
                {t("Documentation", "ডকুমেন্টেশন")}
              </Link>
            </li>
            <li>
              <Link to="/status" className={linkCls}>
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" /> {t("System status", "সিস্টেম স্ট্যাটাস")}
                </span>
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className={linkCls}>
                {t("Client dashboard", "ক্লায়েন্ট ড্যাশবোর্ড")}
              </Link>
            </li>
          </Col>

          <Col title={t("Trust", "নিরাপত্তা")}>
            <li>
              <Link to="/security" className={linkCls}>
                {t("Security overview", "নিরাপত্তা ওভারভিউ")}
              </Link>
            </li>
            <li>
              <Link to="/security" hash="data" className={linkCls}>
                {t("Data handling & GDPR", "ডেটা ব্যবস্থাপনা ও GDPR")}
              </Link>
            </li>
            <li>
              <Link to="/security" hash="isolation" className={linkCls}>
                {t("Tenant isolation", "টেন্যান্ট আইসোলেশন")}
              </Link>
            </li>
            <li>
              <a
                href="mailto:antheticplusstudios@gmail.com?subject=Vulnerability%20disclosure"
                className={linkCls}
              >
                {t("Vulnerability disclosure", "দুর্বলতা রিপোর্ট")}
              </a>
            </li>
          </Col>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()}{" "}
            <span className="font-semibold text-foreground">AntheticPlus Studios</span> &middot;{" "}
            {t("Founded by Smyight", "প্রতিষ্ঠাতা Smyight")}
          </p>
          <p className="flex flex-wrap items-center gap-4">
            <span>
              {t("Server time", "সার্ভার সময়")} <UtcClock />
            </span>
            <a
              className="inline-flex items-center gap-1 font-semibold text-primary"
              href="mailto:antheticplusstudios@gmail.com"
            >
              <Mail className="h-3.5 w-3.5" /> antheticplusstudios@gmail.com
            </a>
          </p>
        </div>
      </Reveal>
    </footer>
  );
}
