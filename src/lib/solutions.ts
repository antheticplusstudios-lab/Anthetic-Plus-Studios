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
  { id: "real-estate", icon: "building-2", slug: "lead-capture-qualifier", en: { team: "Real estate", problem: "Capture property enquiries, understand buyer requirements and route qualified interest to the right team member." }, bn: { team: "রিয়েল এস্টেট", problem: "প্রপার্টি সংক্রান্ত জিজ্ঞাসা সংগ্রহ, ক্রেতার চাহিদা বোঝা এবং উপযুক্ত টিম সদস্যের কাছে পাঠান।" } },
  { id: "healthcare", icon: "heart-pulse", slug: "voice-sms-receptionist", en: { team: "Healthcare", problem: "Help patients reach the right team, capture appointment requests and coordinate follow-up." }, bn: { team: "স্বাস্থ্যসেবা", problem: "রোগীদের সঠিক টিমের কাছে পৌঁছাতে, অ্যাপয়েন্টমেন্টের অনুরোধ নিতে এবং ফলো-আপ সমন্বয় করতে সহায়তা করুন।" } },
  { id: "ecommerce", icon: "shopping-bag", slug: "social-dm-assistant", en: { team: "E-commerce", problem: "Respond to product questions across messaging channels, capture buyer interest and hand conversations to staff." }, bn: { team: "ই-কমার্স", problem: "মেসেজিং চ্যানেলে পণ্যের প্রশ্নের উত্তর, ক্রেতার আগ্রহ সংগ্রহ এবং প্রয়োজনে কর্মীদের কাছে কথোপকথন পাঠান।" } },
  { id: "education", icon: "life-buoy", slug: "knowledge-base-support", en: { team: "Education", problem: "Answer common questions from approved course, admission and service information, with a clear human hand-off." }, bn: { team: "শিক্ষা", problem: "অনুমোদিত কোর্স, ভর্তি ও সেবা-সংক্রান্ত তথ্য থেকে সাধারণ প্রশ্নের উত্তর দিন এবং প্রয়োজনে মানুষের কাছে পাঠান।" } },
  { id: "hospitality", icon: "calendar-check", slug: "voice-sms-receptionist", en: { team: "Hotels & hospitality", problem: "Handle guest enquiries, capture booking requests and pass important details to the front desk." }, bn: { team: "হোটেল ও আতিথেয়তা", problem: "অতিথির জিজ্ঞাসা সামলান, বুকিং অনুরোধ সংগ্রহ করুন এবং গুরুত্বপূর্ণ তথ্য ফ্রন্ট ডেস্কে পাঠান।" } },
  { id: "finance", icon: "life-buoy", slug: "knowledge-base-support", en: { team: "Finance", problem: "Provide consistent answers from approved service information and route sensitive or complex requests to staff." }, bn: { team: "ফাইন্যান্স", problem: "অনুমোদিত সেবার তথ্য থেকে ধারাবাহিক উত্তর দিন এবং সংবেদনশীল বা জটিল অনুরোধ কর্মীদের কাছে পাঠান।" } },
  { id: "professional-services", icon: "users", slug: "lead-capture-qualifier", en: { team: "Professional services", problem: "Qualify incoming enquiries, capture project details and help the team prioritize follow-up." }, bn: { team: "পেশাদার সেবা", problem: "আসা জিজ্ঞাসা যাচাই, প্রকল্পের তথ্য সংগ্রহ এবং ফলো-আপ অগ্রাধিকার নির্ধারণে টিমকে সহায়তা করুন।" } },
];

/** Solutions only ever point at products that actually exist in the catalog. */
export function availableSolutions(
  list: SiteSolution[],
  plans?: readonly ProductListing[],
): SiteSolution[] {
  return list.filter((s) => solutionSchema.safeParse(s).success && isListedProduct(s.slug, plans));
}
