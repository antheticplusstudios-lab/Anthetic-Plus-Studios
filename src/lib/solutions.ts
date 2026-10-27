import {
  Building2,
  CalendarCheck,
  Globe2,
  HeartPulse,
  LifeBuoy,
  Megaphone,
  PhoneCall,
  ShoppingBag,
  Sparkles,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { automations, type AutomationSlug } from "@/lib/automations";
import { z } from "zod";
import { isListedProduct, type ProductListing } from "@/lib/storefront";

/** Icon choices offered in the admin editor; stored as stable string keys. */
export const SOLUTION_ICONS = {
  "heart-pulse": HeartPulse,
  wrench: Wrench,
  "building-2": Building2,
  "life-buoy": LifeBuoy,
  "shopping-bag": ShoppingBag,
  megaphone: Megaphone,
  "phone-call": PhoneCall,
  sparkles: Sparkles,
  globe: Globe2,
  users: Users,
  zap: Zap,
  "calendar-check": CalendarCheck,
} as const satisfies Record<string, LucideIcon>;

export type SolutionIconKey = keyof typeof SOLUTION_ICONS;

export type SolutionCopy = { team: string; problem: string };

export type SiteSolution = {
  id: string;
  icon: SolutionIconKey;
  /** Product this solution card links to (/automations/$slug). */
  slug: AutomationSlug;
  en: SolutionCopy;
  bn: SolutionCopy;
};

export const solutionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  icon: z
    .string()
    .refine((key): key is SolutionIconKey => Object.hasOwn(SOLUTION_ICONS, key), "Unknown icon"),
  slug: z
    .string()
    .refine(
      (slug): slug is AutomationSlug => automations.some((product) => product.slug === slug),
      "Unknown product",
    ),
  en: z.object({
    team: z.string().trim().min(1).max(120),
    problem: z.string().trim().min(1).max(500),
  }),
  bn: z.object({
    team: z.string().trim().min(1).max(120),
    problem: z.string().trim().min(1).max(500),
  }),
});
export const solutionsListSchema = z
  .array(solutionSchema)
  .max(24)
  .refine(
    (list) => new Set(list.map((item) => item.id)).size === list.length,
    "Solution IDs must be unique",
  );

/** Built-in defaults, used only when no configuration exists or public reads fail. */
export const DEFAULT_SOLUTIONS: SiteSolution[] = [
  {
    id: "clinics",
    icon: "heart-pulse",
    slug: "voice-sms-receptionist",
    en: {
      team: "Dental & medical practices",
      problem:
        "The receptionist answers every call, checks live calendar availability, books the appointment and texts a confirmation.",
    },
    bn: {
      team: "ডেন্টাল ও মেডিকেল প্র্যাকটিস",
      problem:
        "রিসেপশনিস্ট প্রতিটি কল ধরে, লাইভ ক্যালেন্ডার দেখে অ্যাপয়েনমেন্ট বুক করে এবং কনফার্মেশন এসএমএস পাঠায়।",
    },
  },
  {
    id: "home-services",
    icon: "wrench",
    slug: "voice-sms-receptionist",
    en: {
      team: "Home service companies",
      problem:
        "Job details are captured, a visit is booked from real availability and the team is notified — even mid-emergency.",
    },
    bn: {
      team: "হোম সার্ভিস কোম্পানি",
      problem:
        "কাজের বিবরণ নেওয়া হয়, আসল সময়সূচি থেকে ভিজিট বুক হয় এবং টিমকে জানানো হয় — জরুরি মুহূর্তেও।",
    },
  },
  {
    id: "agencies",
    icon: "building-2",
    slug: "lead-capture-qualifier",
    en: {
      team: "Agencies & B2B service providers",
      problem:
        "The qualifier starts a conversation on-site, asks about budget, timeline and service, and routes hot leads instantly.",
    },
    bn: {
      team: "এজেন্সি ও B2B সার্ভিস প্রোভাইডার",
      problem:
        "কোয়ালিফায়ার সাইটেই কথোপকথন শুরু করে, বাজেট-সময়সীমা-সার্ভিস জানতে চায় এবং হট লিড সঙ্গে সঙ্গে পাঠায়।",
    },
  },
  {
    id: "saas-support",
    icon: "life-buoy",
    slug: "knowledge-base-support",
    en: {
      team: "SaaS & membership support teams",
      problem:
        "The support agent learns your docs and FAQs, answers with citations and hands complex requests to a person.",
    },
    bn: {
      team: "SaaS ও মেম্বারশিপ সাপোর্ট টিম",
      problem:
        "সাপোর্ট এজেন্ট আপনার ডকস ও FAQ শেখে, সূত্রসহ উত্তর দেয় এবং জটিল অনুরোধ মানুষের কাছে পাঠায়।",
    },
  },
  {
    id: "ecommerce",
    icon: "shopping-bag",
    slug: "social-dm-assistant",
    en: {
      team: "Ecommerce & hospitality",
      problem:
        "Product questions across WhatsApp, Instagram and Messenger get instant answers, and qualified buyers reach your team.",
    },
    bn: {
      team: "ইকমার্স ও হসপিটালিটি",
      problem:
        "WhatsApp, Instagram ও Messenger-এ প্রোডাক্টের প্রশ্নের তাৎক্ষণিক উত্তর মিলে, যাচাইকৃত ক্রেতা টিমে পৌঁছায়।",
    },
  },
  {
    id: "social-first",
    icon: "megaphone",
    slug: "social-dm-assistant",
    en: {
      team: "Social-first businesses",
      problem:
        "Campaign message spikes are handled around the clock, with contact details captured from every conversation.",
    },
    bn: {
      team: "সোশ্যাল-ফার্স্ট ব্যবসা",
      problem:
        "ক্যাম্পেইনের মেসেজ চাপ দিন-রাত সামলানো হয়, প্রতিটি কথোপকথনের যোগাযোগ তথ্য সংরক্ষিত হয়।",
    },
  },
];

/** Solutions only ever point at products that actually exist in the catalog. */
export function availableSolutions(
  list: SiteSolution[],
  plans?: readonly ProductListing[],
): SiteSolution[] {
  return list.filter((s) => solutionSchema.safeParse(s).success && isListedProduct(s.slug, plans));
}
