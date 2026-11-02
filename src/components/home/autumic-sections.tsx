import { ArrowRight, Building2, CalendarCheck, Headset, MessageSquareText, Workflow, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { useT } from "@/lib/i18n";

const services = [
  { icon: Headset, title: ["AI Receptionist", "AI রিসেপশনিস্ট"], description: ["Handle incoming customer calls and enquiries, capture details and route requests to the right person.", "গ্রাহকের কল ও জিজ্ঞাসার উত্তর, তথ্য সংগ্রহ এবং সঠিক ব্যক্তির কাছে অনুরোধ পৌঁছে দিন।"] },
  { icon: Workflow, title: ["Workflow Automation", "ওয়ার্কফ্লো অটোমেশন"], description: ["Connect repetitive business tasks and move information between the tools your team already uses.", "নিয়মিত পুনরাবৃত্ত কাজ সংযুক্ত করুন এবং টিমের ব্যবহৃত টুলগুলোর মধ্যে তথ্য আদান-প্রদান করুন।"] },
  { icon: Users, title: ["AI Sales Agent", "AI সেলস এজেন্ট"], description: ["Respond to enquiries, qualify potential buyers and support timely lead follow-up.", "জিজ্ঞাসার উত্তর দিন, সম্ভাব্য ক্রেতা যাচাই করুন এবং সময়মতো লিড ফলো-আপ করুন।"] },
  { icon: MessageSquareText, title: ["AI Chatbot", "AI চ্যাটবট"], description: ["Give customers helpful answers through configured website and messaging experiences.", "ওয়েবসাইট ও মেসেজিং চ্যানেলে গ্রাহকদের সহায়ক উত্তর দিন।"] },
];

const industries = ["Real estate", "Healthcare", "E-commerce", "Education", "Hotels & hospitality", "Finance", "Professional services"];

export function AutumicServicesSection() {
  const t = useT();
  return (
    <>
      <section id="solutions" className="section-blend py-20 sm:py-28">
        <div className="container-page">
          <Reveal className="max-w-3xl">
            <span className="eyebrow">{t("What we build", "আমরা যা তৈরি করি")}</span>
            <h2 className="h-section mt-4">{t("AI employees for the work that keeps your business moving.", "আপনার ব্যবসাকে সচল রাখার কাজে AI কর্মী।")}</h2>
            <p className="lead mt-4">{t("From the first customer enquiry to the follow-up after a sale, Autumic designs practical automation around the way your business works.", "প্রথম গ্রাহক-জিজ্ঞাসা থেকে বিক্রয়ের পর ফলো-আপ পর্যন্ত, Autumic আপনার ব্যবসার কাজের ধরন অনুযায়ী বাস্তবসম্মত অটোমেশন তৈরি করে।")}</p>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {services.map((service, index) => (
              <Reveal key={service.title[0]} delay={index * 0.06}>
                <article className="surface-card lift h-full p-6 sm:p-7">
                  <span className="grid size-12 place-items-center rounded-2xl border border-border bg-muted text-foreground"><service.icon className="size-5" /></span>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{t(service.title[0], service.title[1])}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{t(service.description[0], service.description[1])}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div><p className="font-semibold">{t("Need something more specific?", "আপনার কি আরও নির্দিষ্ট সমাধান দরকার?")}</p><p className="mt-1 text-sm text-muted-foreground">{t("We also build WhatsApp AI automation, lead follow-up, appointment booking, email automation and custom workflows.", "আমরা WhatsApp AI অটোমেশন, লিড ফলো-আপ, অ্যাপয়েন্টমেন্ট বুকিং, ইমেইল অটোমেশন এবং কাস্টম ওয়ার্কফ্লোও তৈরি করি।")}</p></div>
            <Button asChild variant="outline"><Link to="/contact">{t("Discuss your workflow", "আপনার কাজ নিয়ে কথা বলুন")} <ArrowRight /></Link></Button>
          </div>
        </div>
      </section>
      <section id="industries" className="py-20 sm:py-28">
        <div className="container-page grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <Reveal><span className="eyebrow">{t("Who we work with", "আমরা যাদের সাথে কাজ করি")}</span><h2 className="h-section mt-4">{t("Automation shaped around your industry.", "আপনার শিল্পখাত অনুযায়ী অটোমেশন।")}</h2><p className="lead mt-4">{t("We work with businesses in Bangladesh and international markets, adapting each solution to the team's real processes and customer needs.", "বাংলাদেশ ও আন্তর্জাতিক বাজারের ব্যবসার সঙ্গে কাজ করি, প্রতিটি সমাধান টিমের বাস্তব প্রক্রিয়া ও গ্রাহকের প্রয়োজন অনুযায়ী সাজাই।")}</p></Reveal>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{industries.map((industry) => <div key={industry} className="surface-card flex min-h-20 items-center gap-3 p-4 text-sm font-semibold"><Building2 className="size-4 shrink-0 text-primary" />{industry}</div>)}</div>
        </div>
      </section>
      <section id="workflow" className="section-blend py-20 sm:py-28">
        <div className="container-page">
          <Reveal className="max-w-3xl"><span className="eyebrow">{t("From manual work to connected workflows", "ম্যানুয়াল কাজ থেকে সংযুক্ত ওয়ার্কফ্লো")}</span><h2 className="h-section mt-4">{t("Give repetitive work a better route.", "পুনরাবৃত্ত কাজের জন্য আরও ভালো পথ তৈরি করুন।")}</h2><p className="lead mt-4">{t("The exact workflow depends on your business. A typical customer journey can be connected from first enquiry through qualification, follow-up and hand-off.", "নির্দিষ্ট ওয়ার্কফ্লো আপনার ব্যবসার ওপর নির্ভর করে। সাধারণ গ্রাহক-যাত্রাকে প্রথম জিজ্ঞাসা থেকে যাচাই, ফলো-আপ ও টিমে হস্তান্তর পর্যন্ত সংযুক্ত করা যায়।")}</p></Reveal>
          <div className="mt-10 grid gap-3 md:grid-cols-5">{[{n:"01",t:["Enquiry","জিজ্ঞাসা"],d:["A customer reaches out","গ্রাহক যোগাযোগ করেন"]},{n:"02",t:["Understand","প্রয়োজন বোঝা"],d:["Capture intent and details","প্রয়োজন ও তথ্য সংগ্রহ"]},{n:"03",t:["Respond","উত্তর"],d:["Provide a relevant response","প্রাসঙ্গিক উত্তর প্রদান"]},{n:"04",t:["Follow up","ফলো-আপ"],d:["Keep the next step moving","পরবর্তী ধাপ এগিয়ে নেওয়া"]},{n:"05",t:["Handoff","টিমে হস্তান্তর"],d:["Bring a person in when needed","প্রয়োজনে মানুষের সহায়তা"]}].map((step)=><article key={step.n} className="surface-card p-5"><span className="text-xs font-bold tracking-widest text-primary">{step.n}</span><h3 className="mt-4 font-semibold">{t(step.t[0], step.t[1])}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(step.d[0], step.d[1])}</p></article>)}</div>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><CalendarCheck className="size-4" />{t("Appointment booking, CRM updates and team notifications can be included where they fit your process.", "আপনার প্রক্রিয়ার সঙ্গে মানানসই হলে অ্যাপয়েন্টমেন্ট বুকিং, CRM আপডেট ও টিম নোটিফিকেশন যুক্ত করা যায়।")}</p>
        </div>
      </section>
      <section className="pb-20"><div className="container-page"><div className="surface-card flex flex-col items-start justify-between gap-6 rounded-3xl p-7 sm:flex-row sm:items-center sm:p-10"><div className="max-w-2xl"><span className="eyebrow">{t("Start with the problem", "সমস্যা থেকেই শুরু করুন")}</span><h2 className="h-section mt-3">{t("Tell us what your team should no longer have to do manually.", "আপনার টিমের কোন কাজ আর হাতে করতে হওয়া উচিত নয়, আমাদের জানান।")}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{t("Book a free consultation. We’ll learn how your business operates and discuss a custom automation plan. No public package pricing.", "বিনামূল্যে পরামর্শ নিন। আপনার ব্যবসা কীভাবে চলে তা বুঝে কাস্টম অটোমেশন পরিকল্পনা নিয়ে আলোচনা করব।")}</p></div><Button asChild size="lg"><Link to="/contact">{t("Book a free consultation", "বিনামূল্যে পরামর্শ নিন")} <ArrowRight /></Link></Button></div></div></section>
    </>
  );
}
