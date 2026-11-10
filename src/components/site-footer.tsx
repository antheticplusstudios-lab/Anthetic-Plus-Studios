import { Link } from "@tanstack/react-router";
import { Activity, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { HomeBrand } from "@/components/home-brand";
import { automations } from "@/lib/automations";
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
  const suite = automations;

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
                "We build AI employees that answer customers, generate sales and automate business operations — around the clock.",
                "গ্রাহকের উত্তর, বিক্রয় এবং ব্যবসার কাজ স্বয়ংক্রিয় করতে আমরা তৈরি করি AI কর্মী — দিনরাত, নিরবচ্ছিন্নভাবে।",
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
              <Link to="/contact" className={linkCls}>
                {t("Custom proposal", "কাস্টম প্রস্তাব")}
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
            <li>
              <Link to="/contributions" className={linkCls}>
                {t("Contributions of Autumic", "Autumic-এর অবদান")}
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
              <a href="mailto:info@autumic.com?subject=Security%20disclosure" className={linkCls}>
                {t("Vulnerability disclosure", "দুর্বলতা রিপোর্ট")}
              </a>
            </li>
          </Col>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()}{" "}
            <span className="font-semibold text-foreground">Autumic</span> &middot;{" "}
            {t("Build To Automate", "অটোমেশনের জন্য তৈরি")}
          </p>
          <p className="flex flex-wrap items-center gap-4">
            <span>
              {t("Server time", "সার্ভার সময়")} <UtcClock />
            </span>
            <span>Baridhara, Dhaka-1212, Bangladesh</span>
            <a
              className="inline-flex items-center gap-1 font-semibold text-primary"
              href="mailto:info@autumic.com"
            >
              <Mail className="h-3.5 w-3.5" /> info@autumic.com
            </a>
          </p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <a
              href="https://www.youtube.com/channel/UC0vT8TOozzm4pTHAhdYESYg"
              target="_blank"
              rel="noreferrer"
            >
              YouTube
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61594363408424&rdid=s35JYQRvfs4X1m27&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F19f32W6RZQ%2F#"
              target="_blank"
              rel="noreferrer"
            >
              Facebook
            </a>
            <a href="https://www.instagram.com/tryautumic" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a
              href="https://api.whatsapp.com/send/?phone=8801915349394&text=Hello+Autumic%2C+I%27d+like+to+learn+more+about+your+AI+automation+solutions.&type=phone_number&app_absent=0"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <span>+880 1915-349394</span>
          </div>
        </div>
      </Reveal>
    </footer>
  );
}
