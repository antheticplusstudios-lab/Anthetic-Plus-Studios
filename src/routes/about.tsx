import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Database,
  Eye,
  HandHeart,
  Languages,
  Mail,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { MarketingPage, PageHero, SectionHead } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — AntheticPlus Studios" },
      {
        name: "description",
        content:
          "AntheticPlus Studios builds focused AI systems that answer, qualify, support and route — monitored, domain-locked and handed to a person when needed.",
      },
      { property: "og:title", content: "About AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Why we build AI front-office systems, and the principles every system follows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  const t = useT();
  const principles = [
    {
      icon: UserCheck,
      t: t("People stay in the loop", "মানুষ সবসময় যুক্ত থাকে"),
      b: t(
        "Payments are checked by a person, and conversations go to your team whenever the AI shouldn't answer.",
        "পেমেন্ট একজন মানুষ যাচাই করেন, আর AI-এর উত্তর দেওয়া উচিত না হলে কথোপকথন আপনার টিমে যায়।",
      ),
    },
    {
      icon: Eye,
      t: t("Everything is visible", "সবকিছু দৃশ্যমান"),
      b: t(
        "Each system has a real status — testing, active, paused or expired — with transcripts and usage you can read.",
        "প্রতিটি সিস্টেমের আসল স্ট্যাটাস থাকে — টেস্টিং, সক্রিয়, বিরতি বা মেয়াদোত্তীর্ণ — সাথে পড়ার মতো ট্রান্সক্রিপ্ট ও ব্যবহারের হিসাব।",
      ),
    },
    {
      icon: ShieldCheck,
      t: t("Locked to your domain", "আপনার ডোমেইনে লক"),
      b: t(
        "Every deployment is bound to your website and kept separate from every other client.",
        "প্রতিটি ডিপ্লয়মেন্ট আপনার ওয়েবসাইটে আবদ্ধ এবং অন্য সব ক্লায়েন্ট থেকে আলাদা।",
      ),
    },
    {
      icon: Database,
      t: t("Separated data", "আলাদা ডেটা"),
      b: t(
        "Identity, billing, AI and customer conversations live in four separate databases.",
        "পরিচয়, বিলিং, AI ও গ্রাহক কথোপকথন চারটি আলাদা ডাটাবেসে থাকে।",
      ),
    },
    {
      icon: Languages,
      t: t("Built for many languages", "বহু ভাষার জন্য তৈরি"),
      b: t(
        "Our assistant understands and replies in English, Bangla and mixed-language conversations.",
        "আমাদের অ্যাসিস্ট্যান্ট ইংরেজি, বাংলা ও মিশ্র ভাষার কথোপকথন বোঝে ও উত্তর দেয়।",
      ),
    },
    {
      icon: HandHeart,
      t: t("Honest billing", "সৎ বিলিং"),
      b: t(
        "Clear expiry dates, a warning before renewal and no hidden charges or card lock-in.",
        "স্পষ্ট মেয়াদ, নবায়নের আগে সতর্কবার্তা, কোনো লুকানো চার্জ বা কার্ডের বাধ্যবাধকতা নেই।",
      ),
    },
  ];

  return (
    <MarketingPage>
      <PageHero
        eyebrow={t("About us", "আমাদের কথা")}
        title={t(
          "We build AI that actually runs part of your business.",
          "আমরা এমন AI বানাই যা সত্যিই আপনার ব্যবসার একটি অংশ চালায়।",
        )}
        lead={t(
          "AntheticPlus Studios was founded by Smyight to give growing businesses a front office that never sleeps. Instead of a generic chatbot, we install focused systems — each configured for one job, monitored while it runs, and handing off to your team when a person is needed.",
          "AntheticPlus Studios প্রতিষ্ঠা করেছেন Smyight, যাতে বাড়তে থাকা ব্যবসাগুলো এমন একটি ফ্রন্ট অফিস পায় যা কখনো ঘুমায় না। সাধারণ চ্যাটবটের বদলে আমরা নির্দিষ্ট সিস্টেম ইনস্টল করি — প্রতিটি একটি কাজের জন্য কনফিগার করা, চলার সময় মনিটর করা এবং প্রয়োজনে আপনার টিমে হস্তান্তর করা।",
        )}
      />

      <section className="py-16 sm:py-24">
        <div className="container-page grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHead
            eyebrow={t("Mission", "লক্ষ্য")}
            title={t("No customer left waiting.", "কোনো গ্রাহককে অপেক্ষা করতে হবে না।")}
            lead={t(
              "Missed calls, unanswered DMs and slow support replies quietly cost businesses every day. Our mission is to make sure every customer gets a fast, accurate answer — in their own language — while your team focuses on the work only people can do.",
              "মিস কল, অনুত্তরিত ডিএম আর ধীর সাপোর্ট প্রতিদিন নীরবে ব্যবসার ক্ষতি করে। আমাদের লক্ষ্য — প্রতিটি গ্রাহক যেন নিজের ভাষায় দ্রুত ও সঠিক উত্তর পান, আর আপনার টিম সেই কাজে মন দিতে পারে যা শুধু মানুষই পারে।",
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {principles.map((p) => (
              <div key={p.t} className="surface-card lift p-5">
                <p.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-extrabold">{p.t}</h3>
                <p className="mt-1.5 text-sm leading-6 text-body">{p.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-blend py-16 sm:py-20">
        <div className="container-page grid gap-6 md:grid-cols-3">
          {[
            [
              t("What we build", "আমরা কী বানাই"),
              t(
                "Voice & SMS reception, lead qualification, knowledge-base support and social messaging assistants.",
                "ভয়েস ও এসএমএস রিসেপশন, লিড যাচাই, নলেজ-বেস সাপোর্ট এবং সোশ্যাল মেসেজিং অ্যাসিস্ট্যান্ট।",
              ),
            ],
            [
              t("How we work", "আমরা কীভাবে কাজ করি"),
              t(
                "You give us your business context, we configure and test the system, then bind it to your domain.",
                "আপনি ব্যবসার তথ্য দেন, আমরা সিস্টেম কনফিগার ও টেস্ট করি, তারপর আপনার ডোমেইনে যুক্ত করি।",
              ),
            ],
            [
              t("Who we serve", "আমরা কাদের সেবা দিই"),
              t(
                "Clinics, home services, agencies, SaaS teams, ecommerce and hospitality businesses.",
                "ক্লিনিক, হোম সার্ভিস, এজেন্সি, SaaS টিম, ইকমার্স ও হসপিটালিটি ব্যবসা।",
              ),
            ],
          ].map(([h, b]) => (
            <div key={h} className="surface-card p-6">
              <h3 className="text-lg font-extrabold">{h}</h3>
              <p className="mt-2 text-sm leading-6 text-body">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="surface-card flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
            <SectionHead
              title={t("Let's talk about your business.", "চলুন আপনার ব্যবসা নিয়ে কথা বলি।")}
              lead={t(
                "We reply to every message personally, usually within one business day.",
                "আমরা প্রতিটি মেসেজের ব্যক্তিগতভাবে উত্তর দিই, সাধারণত এক কর্মদিবসের মধ্যে।",
              )}
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="hero" size="xl" asChild>
                <Link to="/contact">
                  {t("Contact us", "যোগাযোগ করুন")} <ArrowRight />
                </Link>
              </Button>
              <Button variant="pill" size="xl" asChild>
                <a href="mailto:antheticplusstudios@gmail.com">
                  <Mail /> {t("Email", "ইমেইল")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
