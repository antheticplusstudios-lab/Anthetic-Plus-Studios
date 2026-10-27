import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Check, Copy, Search } from "lucide-react";
import { MarketingPage, PageHero } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useLang, useT } from "@/lib/i18n";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — AntheticPlus Studios" },
      {
        name: "description",
        content:
          "How to choose, order, pay for, install and run AntheticPlus AI systems: embed script, domain lock, payments, renewals and the multilingual assistant.",
      },
      { property: "og:title", content: "AntheticPlus Documentation" },
      {
        property: "og:description",
        content:
          "Ordering, verification, installation, domain lock, renewals and security — explained.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Docs,
});

type Doc = { id: string; en: [string, string[]]; bn: [string, string[]]; code?: string };

const EMBED = `<script src="https://YOUR-ANTHETICPLUS-HOST/assistant.js" data-site-id="YOUR_SITE_ID" defer></script>`;

const DOCS: Doc[] = [
  {
    id: "getting-started",
    en: [
      "Getting started",
      [
        "Create a client account from Get Started. Your account holds your orders, active automations, payments and profile.",
        "Each AntheticPlus system is sold separately. Start with the one covering the moment you lose the most customers, and add more later from your dashboard.",
      ],
    ],
    bn: [
      "শুরু করা",
      [
        "‘শুরু করুন’ থেকে একটি ক্লায়েন্ট অ্যাকাউন্ট খুলুন। আপনার অর্ডার, সক্রিয় অটোমেশন, পেমেন্ট ও প্রোফাইল এখানেই থাকে।",
        "প্রতিটি সিস্টেম আলাদাভাবে বিক্রি হয়। যেখানে সবচেয়ে বেশি গ্রাহক হারান সেটি দিয়ে শুরু করুন, পরে ড্যাশবোর্ড থেকে আরও যোগ করুন।",
      ],
    ],
  },
  {
    id: "ordering",
    en: [
      "Ordering & payment",
      [
        "Choose a product and a billing interval (monthly or yearly) on the Pricing page. Yearly plans apply the discount shown on each product.",
        "No credit card or payment gateway is required. Pay by bank transfer, crypto or mobile money, then submit the transaction reference with your order.",
        "A person verifies every payment. Once approved, your automation is activated with the exact expiry date shown on the order.",
      ],
    ],
    bn: [
      "অর্ডার ও পেমেন্ট",
      [
        "মূল্য পেজে একটি প্রোডাক্ট ও বিলিং সময়কাল (মাসিক বা বার্ষিক) বেছে নিন। বার্ষিক প্ল্যানে প্রতিটি প্রোডাক্টে দেখানো ছাড় প্রযোজ্য।",
        "কোনো ক্রেডিট কার্ড বা পেমেন্ট গেটওয়ে লাগে না। ব্যাংক ট্রান্সফার, ক্রিপ্টো বা মোবাইল মানি দিয়ে পেমেন্ট করে অর্ডারের সাথে ট্রানজ্যাকশন রেফারেন্স দিন।",
        "প্রতিটি পেমেন্ট একজন মানুষ যাচাই করেন। অনুমোদনের পর অর্ডারে দেখানো নির্দিষ্ট মেয়াদসহ আপনার অটোমেশন চালু হয়।",
      ],
    ],
  },
  {
    id: "onboarding",
    en: [
      "Giving the AI your business",
      [
        "Add your services, hours, pricing and policies in the onboarding form. That context becomes the guardrail the AI never leaves.",
        "Together with a global safety baseline, it decides what the AI may claim. It never invents prices, availability or legal and medical advice, and it escalates when unsure.",
      ],
    ],
    bn: [
      "AI-কে আপনার ব্যবসার তথ্য দেওয়া",
      [
        "অনবোর্ডিং ফর্মে আপনার সার্ভিস, সময়সূচি, মূল্য ও নীতিমালা যোগ করুন। এই তথ্যই AI-এর সীমারেখা।",
        "একটি বৈশ্বিক নিরাপত্তা ভিত্তির সাথে মিলে এটি ঠিক করে AI কী বলতে পারবে। এটি কখনো মূল্য, প্রাপ্যতা বা আইনি/চিকিৎসা পরামর্শ বানিয়ে বলে না এবং অনিশ্চিত হলে হস্তান্তর করে।",
      ],
    ],
  },
  {
    id: "installation",
    en: [
      "Installing on your website",
      [
        "After activation we provision your site ID and bind it to your domain. Paste the single script tag before the closing </body> tag of your site.",
        "Copy the exact snippet from your dashboard — it contains your real site ID (and site key when one is required).",
      ],
    ],
    bn: [
      "ওয়েবসাইটে ইনস্টল করা",
      [
        "চালু হওয়ার পর আমরা আপনার সাইট আইডি তৈরি করে আপনার ডোমেইনে যুক্ত করি। সাইটের </body> ট্যাগের আগে একটি মাত্র স্ক্রিপ্ট ট্যাগ বসান।",
        "আপনার ড্যাশবোর্ড থেকে হুবহু স্নিপেটটি কপি করুন — এতে আপনার আসল সাইট আইডি (প্রয়োজনে সাইট কী) থাকে।",
      ],
    ],
    code: EMBED,
  },
  {
    id: "domain-lock",
    en: [
      "Domain lock & isolation",
      [
        "One client ID is bound to one domain. The widget only loads on that origin and refuses to run anywhere else.",
        "Your conversations, leads and billing records are isolated per account and are never shared with another client.",
      ],
    ],
    bn: [
      "ডোমেইন লক ও আইসোলেশন",
      [
        "একটি ক্লায়েন্ট আইডি একটি ডোমেইনে আবদ্ধ। উইজেট শুধু সেই অরিজিনে লোড হয়, অন্য কোথাও চলে না।",
        "আপনার কথোপকথন, লিড ও বিলিং রেকর্ড প্রতিটি অ্যাকাউন্টে আলাদা এবং কখনো অন্য ক্লায়েন্টের সাথে শেয়ার হয় না।",
      ],
    ],
  },
  {
    id: "assistant",
    en: [
      "Voice assistant & languages",
      [
        "The assistant handles text and voice. Tap the orb or the microphone to speak; it listens, thinks and replies out loud.",
        "It understands English, Bangla and mixed-language messages and answers in the language you use. Sign in to ask about your own account.",
      ],
    ],
    bn: [
      "ভয়েস অ্যাসিস্ট্যান্ট ও ভাষা",
      [
        "অ্যাসিস্ট্যান্ট টেক্সট ও ভয়েস দুটোই সামলায়। কথা বলতে অর্ব বা মাইক্রোফোনে ট্যাপ করুন; এটি শোনে, ভাবে এবং জোরে উত্তর দেয়।",
        "এটি ইংরেজি, বাংলা ও মিশ্র ভাষা বোঝে এবং আপনি যে ভাষায় লেখেন সেই ভাষায় উত্তর দেয়। নিজের অ্যাকাউন্ট সম্পর্কে জানতে সাইন ইন করুন।",
      ],
    ],
  },
  {
    id: "renewals",
    en: [
      "Renewals & expiry",
      [
        "You get a warning five days before expiry, then a grace window, then the system stops answering on your site.",
        "Nothing is deleted. Reconnecting takes one verified payment, and an admin can extend a grace period if something slips.",
      ],
    ],
    bn: [
      "নবায়ন ও মেয়াদ",
      [
        "মেয়াদ শেষের পাঁচ দিন আগে সতর্কবার্তা পাবেন, তারপর একটি গ্রেস সময়, এরপর সিস্টেম আপনার সাইটে উত্তর দেওয়া বন্ধ করে।",
        "কিছুই মুছে ফেলা হয় না। একটি যাচাইকৃত পেমেন্টেই আবার চালু হয়, আর প্রয়োজনে অ্যাডমিন গ্রেস সময় বাড়াতে পারেন।",
      ],
    ],
  },
  {
    id: "channels",
    en: [
      "Channels",
      [
        "Voice and SMS, website chat, WhatsApp, Instagram and Messenger — each system covers its own channels and is billed on its own.",
      ],
    ],
    bn: [
      "চ্যানেল",
      [
        "ভয়েস ও এসএমএস, ওয়েবসাইট চ্যাট, WhatsApp, Instagram ও Messenger — প্রতিটি সিস্টেম নিজস্ব চ্যানেল কভার করে এবং আলাদাভাবে বিল হয়।",
      ],
    ],
  },
];

function CodeBlock({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-navy">
      <div className="flex items-center justify-between border-b border-primary-foreground/10 px-4 py-2">
        <span className="text-xs font-semibold text-primary-foreground/70">HTML</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-foreground/80 hover:text-primary-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("Copied", "কপি হয়েছে") : t("Copy", "কপি")}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-primary-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Docs() {
  const t = useT();
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const docs = useMemo(() => {
    const term = q.trim().toLowerCase();
    return DOCS.map((d) => ({
      id: d.id,
      code: d.code,
      title: d[lang][0],
      body: d[lang][1],
    })).filter((d) => !term || (d.title + " " + d.body.join(" ")).toLowerCase().includes(term));
  }, [q, lang]);

  return (
    <MarketingPage>
      <PageHero
        eyebrow={t("Documentation", "ডকুমেন্টেশন")}
        title={t("Everything you need to go live.", "লাইভ হতে যা যা দরকার।")}
        lead={t(
          "From choosing a system to installing it on your site — ordering, verification, domain lock, renewals and the multilingual assistant.",
          "সিস্টেম বাছাই থেকে সাইটে ইনস্টল পর্যন্ত — অর্ডার, যাচাই, ডোমেইন লক, নবায়ন ও বহুভাষিক অ্যাসিস্ট্যান্ট।",
        )}
      >
        <label className="relative w-full max-w-md">
          <span className="sr-only">{t("Search the docs", "ডকসে খুঁজুন")}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search the docs…", "ডকসে খুঁজুন…")}
            className="h-12 w-full rounded-full border border-input bg-card pl-11 pr-4 text-sm shadow-soft outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
          />
        </label>
      </PageHero>

      <section className="py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t("On this page", "এই পেজে")}
            </p>
            <nav className="line-nav mt-3 flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
              {docs.map((d) => (
                <a
                  key={d.id}
                  href={`#${d.id}`}
                  className="line-nav-item shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-body hover:text-foreground"
                >
                  {d.title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            {docs.length === 0 && (
              <div className="surface-card p-10 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-semibold">{t("No results", "কিছু পাওয়া যায়নি")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "Try another word, or ask the team.",
                    "অন্য শব্দ দিয়ে চেষ্টা করুন, অথবা টিমকে জিজ্ঞাসা করুন।",
                  )}
                </p>
              </div>
            )}
            {docs.map((d) => (
              <article key={d.id} id={d.id} className="surface-card scroll-mt-28 p-6 sm:p-8">
                <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{d.title}</h2>
                <div className="mt-4 space-y-3 leading-7 text-body">
                  {d.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
                {d.code && <CodeBlock code={d.code} />}
              </article>
            ))}
            <div className="surface-card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
              <p className="font-semibold">
                {t("Still have a question?", "এখনো প্রশ্ন আছে?")}{" "}
                <span className="font-normal text-body">
                  {t("Our team answers personally.", "আমাদের টিম ব্যক্তিগতভাবে উত্তর দেয়।")}
                </span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link to="/security">{t("Security", "নিরাপত্তা")}</Link>
                </Button>
                <Button asChild>
                  <Link to="/contact">{t("Contact", "যোগাযোগ")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
