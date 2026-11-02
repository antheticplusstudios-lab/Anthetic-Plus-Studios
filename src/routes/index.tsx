import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, UserRoundCheck, Workflow } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/motion";
import { HomeHero } from "@/components/home/home-hero";
import { AutumicServicesSection } from "@/components/home/autumic-sections";
import { AutomationImpactCalculator } from "@/components/home/impact-calculator";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Autumic — Build To Automate" },
    { name: "description", content: "Autumic builds AI employees that answer customers, generate sales and automate business operations 24/7. AI Receptionist, Workflow Automation, AI Sales Agent and AI Chatbot." },
    { property: "og:title", content: "Autumic — Build To Automate" },
    { property: "og:description", content: "Practical AI automation for customer communication, sales and repetitive business workflows." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Index,
});

function Index() {
  const t = useT();
  const steps = [
    { icon: UserRoundCheck, title: t("Understand your process", "আপনার কাজের প্রক্রিয়া বুঝি"), body: t("We learn how enquiries arrive, how your team responds and where repetitive work slows things down.", "জিজ্ঞাসা কীভাবে আসে, টিম কীভাবে উত্তর দেয় এবং কোথায় পুনরাবৃত্ত কাজ সময় নেয় তা বুঝি।") },
    { icon: Workflow, title: t("Design the right automation", "সঠিক অটোমেশন ডিজাইন করি"), body: t("We map a practical workflow around your business, tools, policies and customer journey.", "আপনার ব্যবসা, টুল, নীতিমালা ও গ্রাহক-যাত্রা অনুযায়ী কার্যকর ওয়ার্কফ্লো তৈরি করি।") },
    { icon: ShieldCheck, title: t("Build, test and improve", "তৈরি, পরীক্ষা ও উন্নত করি"), body: t("We configure the system, test its hand-offs and refine it with your team before it becomes part of daily operations.", "সিস্টেম কনফিগার করি, হ্যান্ড-অফ পরীক্ষা করি এবং দৈনন্দিন কাজে যুক্ত করার আগে আপনার টিমের সঙ্গে উন্নত করি।") },
  ];
  const faqs = [
    { q: t("What does Autumic automate?", "Autumic কী কী অটোমেট করে?"), a: t("AI reception, sales conversations, customer support, chatbots, WhatsApp messaging, lead follow-up, appointment booking, email automation and connected business workflows.", "AI রিসেপশন, বিক্রয় কথোপকথন, কাস্টমার সাপোর্ট, চ্যাটবট, WhatsApp মেসেজিং, লিড ফলো-আপ, অ্যাপয়েন্টমেন্ট বুকিং, ইমেইল অটোমেশন ও সংযুক্ত ব্যবসায়িক ওয়ার্কফ্লো।") },
    { q: t("Who do you work with?", "আপনারা কাদের সঙ্গে কাজ করেন?"), a: t("We work with businesses across real estate, healthcare, ecommerce, education, hotels, finance and professional services in Bangladesh and international markets.", "বাংলাদেশ ও আন্তর্জাতিক বাজারে রিয়েল এস্টেট, স্বাস্থ্যসেবা, ই-কমার্স, শিক্ষা, হোটেল, ফাইন্যান্স ও পেশাদার সেবা খাতের ব্যবসার সঙ্গে কাজ করি।") },
    { q: t("Do you publish fixed prices?", "আপনারা কি নির্দিষ্ট মূল্য প্রকাশ করেন?"), a: t("No. Solutions are scoped around your requirements and are quoted after a free consultation.", "না। আপনার প্রয়োজন অনুযায়ী সমাধানের পরিধি নির্ধারণ করে বিনামূল্যে পরামর্শের পর মূল্য প্রস্তাব দেওয়া হয়।") },
    { q: t("Can you build a custom automation?", "আপনারা কি কাস্টম অটোমেশন তৈরি করতে পারেন?"), a: t("Yes. If your process needs a tailored integration or workflow, we can discuss a custom build during the consultation.", "হ্যাঁ। আপনার প্রক্রিয়ায় বিশেষ ইন্টিগ্রেশন বা ওয়ার্কফ্লো প্রয়োজন হলে পরামর্শের সময় কাস্টম সমাধান নিয়ে আলোচনা করতে পারি।") },
  ];
  return <div className="min-h-screen overflow-x-hidden bg-background">
    <SiteHeader />
    <main>
      <HomeHero />
      <AutumicServicesSection />
      <AutomationImpactCalculator />
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="container-page">
          <Reveal className="max-w-3xl"><span className="eyebrow">{t("How it works", "যেভাবে কাজ করি")}</span><h2 className="h-section mt-4">{t("A considered process, built around your business.", "আপনার ব্যবসাকে ঘিরে পরিকল্পিত প্রক্রিয়া।")}</h2><p className="lead mt-4">{t("No one-size-fits-all package. We start with the problem, then shape the system around the outcome your team needs.", "সবার জন্য একই প্যাকেজ নয়। আমরা সমস্যা থেকে শুরু করি, তারপর আপনার টিমের প্রয়োজনীয় ফলাফলের জন্য সিস্টেম তৈরি করি।")}</p></Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">{steps.map((step,index)=><article key={step.title} className="surface-card p-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{index+1}</span><step.icon className="size-5 text-primary"/></div><h3 className="mt-5 text-lg font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{step.body}</p></article>)}</div>
        </div>
      </section>
      <section className="section-blend py-20 sm:py-24"><div className="container-page max-w-4xl"><span className="eyebrow">{t("Questions", "সাধারণ প্রশ্ন")}</span><h2 className="h-section mt-4">{t("A few things worth knowing.", "জেনে রাখা ভালো এমন কিছু বিষয়।")}</h2><Accordion type="single" collapsible className="surface-card mt-8 px-6">{faqs.map((faq,i)=><AccordionItem key={faq.q} value={String(i)}><AccordionTrigger className="text-left">{faq.q}</AccordionTrigger><AccordionContent className="text-sm leading-7 text-muted-foreground">{faq.a}</AccordionContent></AccordionItem>)}</Accordion></div></section>
      <section className="pb-20"><div className="container-page"><div className="surface-card rounded-3xl p-8 text-center sm:p-12"><h2 className="h-section mx-auto max-w-3xl">{t("Let’s make your business easier to run.", "আপনার ব্যবসা পরিচালনা আরও সহজ করি।")}</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{t("Start with a free consultation and a clear conversation about the work you want to automate.", "বিনামূল্যে পরামর্শ দিয়ে শুরু করুন এবং কোন কাজ অটোমেট করতে চান তা নিয়ে পরিষ্কারভাবে কথা বলুন।")}</p><Button asChild size="lg" className="mt-7"><Link to="/contact">{t("Book a free consultation", "বিনামূল্যে পরামর্শ নিন")} <ArrowRight/></Link></Button></div></div></section>
    </main>
    <SiteFooter />
  </div>;
}
