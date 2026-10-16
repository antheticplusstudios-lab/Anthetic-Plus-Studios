import { Bot, Headphones, MessageCircleMore, PhoneCall } from "lucide-react";

export const automations = [
  {
    slug: "voice-sms-receptionist",
    name: "AI Voice & SMS Receptionist",
    shortName: "Voice Receptionist",
    price: 499,
    icon: PhoneCall,
    badge: "Most popular",
    description:
      "Never miss another customer. Answer calls and texts, book appointments, and follow up instantly—24/7.",
    features: [
      "Natural voice and SMS conversations",
      "Live calendar availability and booking with Google Calendar",
      "Instant SMS follow-ups during calls",
      "Custom call flows and escalation rules",
    ],
    useCases: [
      "Dental and medical practices",
      "Home service companies",
      "High-volume appointment teams",
    ],
  },
  {
    slug: "lead-capture-qualifier",
    name: "AI Lead Capture & Smart Qualifier",
    shortName: "Lead Qualifier",
    price: 299,
    icon: Bot,
    badge: "Fastest ROI",
    description:
      "Turn more website visitors into qualified opportunities without adding forms or headcount.",
    features: [
      "Proactive on-site conversations",
      "Budget, timeline, and service qualification",
      "Contact capture and CRM routing",
      "Hot-lead alerts for your sales team",
    ],
    useCases: ["Agencies and consultancies", "B2B service providers", "High-intent landing pages"],
  },
  {
    slug: "knowledge-base-support",
    name: "AI Knowledge Base Support Agent",
    shortName: "Support Agent",
    price: 349,
    icon: Headphones,
    badge: "80% ticket deflection",
    description:
      "Deliver instant, accurate answers grounded in your website, FAQs, and internal documentation.",
    features: [
      "Custom document and FAQ knowledge",
      "Cited, context-aware answers",
      "Human handoff for complex requests",
      "Support analytics and gap reporting",
    ],
    useCases: [
      "SaaS customer support",
      "Membership organizations",
      "Product documentation portals",
    ],
  },
  {
    slug: "social-dm-assistant",
    name: "AI Social DM & Messaging Assistant",
    shortName: "Social DM Assistant",
    price: 299,
    icon: MessageCircleMore,
    badge: "Omnichannel",
    description:
      "Capture and qualify buyers across WhatsApp, Instagram, and Messenger while interest is high.",
    features: [
      "WhatsApp, Instagram, and Messenger",
      "Automatic product Q&A",
      "Lead qualification inside chat",
      "Contact capture and team handoff",
    ],
    useCases: ["Ecommerce brands", "Restaurants and hospitality", "Social-first businesses"],
  },
] as const;

export type Automation = (typeof automations)[number];
export const getAutomation = (slug: string) => automations.find((item) => item.slug === slug);

export const demoInstances = [
  {
    id: "auto-1024",
    slug: "voice-sms-receptionist",
    name: "AI Voice & SMS Receptionist",
    domain: "northstarclinic.com",
    status: "Paid",
    expires: "Oct 22, 2026",
  },
  {
    id: "auto-4096",
    slug: "lead-capture-qualifier",
    name: "AI Lead Capture & Smart Qualifier",
    domain: "launchwise.co",
    status: "Stopped",
    expires: "Sep 30, 2026",
  },
];

export const demoPayments = [
  {
    id: "PAY-4821",
    client: "Northstar Dental",
    automation: "Voice Receptionist",
    amount: "$499",
    method: "Bank transfer",
    transaction: "TXN-884192",
    submitted: "12 min ago",
  },
  {
    id: "PAY-4819",
    client: "Launchwise Studio",
    automation: "Lead Qualifier",
    amount: "$299",
    method: "Wise",
    transaction: "WISE-29018",
    submitted: "48 min ago",
  },
];

/** Canonical product slug → DB2 automation type / DB4 engine kind. Never rename. */
export const ENGINE_KIND_BY_SLUG = {
  "voice-sms-receptionist": "ai_receptionist",
  "lead-capture-qualifier": "lead_capture",
  "knowledge-base-support": "kb_support",
  "social-dm-assistant": "messaging_ai",
} as const;
export type AutomationSlug = keyof typeof ENGINE_KIND_BY_SLUG;
export type EngineKind = (typeof ENGINE_KIND_BY_SLUG)[AutomationSlug];
export const SLUG_BY_ENGINE_KIND = Object.fromEntries(
  Object.entries(ENGINE_KIND_BY_SLUG).map(([s, k]) => [k, s]),
) as Record<EngineKind, AutomationSlug>;
export const isAutomationSlug = (s: string): s is AutomationSlug => s in ENGINE_KIND_BY_SLUG;
