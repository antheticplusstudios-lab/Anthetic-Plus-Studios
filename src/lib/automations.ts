import { Bot, Headphones, MessageCircleMore, PhoneCall } from "lucide-react";

export const automations = [
  {
    slug: "voice-sms-receptionist",
    name: "AI Receptionist",
    shortName: "Receptionist",
    price: 499,
    icon: PhoneCall,
    badge: "Flagship service",
    description:
      "Handle inbound customer calls and enquiries, capture details, support appointment booking and follow-up, and route complex requests to your team.",
    features: [
      "Natural voice and SMS conversations",
      "Appointment booking support and calendar coordination",
      "Customer details and enquiry capture",
      "Human hand-off and escalation rules",
    ],
    useCases: [
      "Healthcare providers",
      "Hotels and hospitality businesses",
      "Real estate and professional service teams",
    ],
  },
  {
    slug: "lead-capture-qualifier",
    name: "AI Lead Capture & Qualifier",
    shortName: "Lead Qualifier",
    price: 299,
    icon: Bot,
    badge: "Lead generation",
    description:
      "Capture enquiry details, validate required contact fields, score buying intent, assign qualified leads to your team and trigger configured follow-up notifications.",
    features: [
      "Configurable lead fields and validation",
      "Rule-based lead scoring and hot/warm/cold tiers",
      "Round-robin assignment for qualified leads",
      "Optional SMS, email and webhook notifications",
    ],
    useCases: [
      "Professional services",
      "Finance and education businesses",
      "Real estate and ecommerce businesses",
    ],
  },
  {
    slug: "knowledge-base-support",
    name: "AI Customer Support Agent",
    shortName: "Support Agent",
    price: 349,
    icon: Headphones,
    badge: "Customer support",
    description:
      "Answer routine customer questions using your approved website content, FAQs and internal documentation, with hand-off when needed.",
    features: [
      "Custom document and FAQ knowledge",
      "Context-aware answers from approved sources",
      "Human handoff for complex requests",
      "Support insights and knowledge-gap reporting",
    ],
    useCases: [
      "Healthcare and finance support",
      "Education providers",
      "Ecommerce customer service",
    ],
  },
  {
    slug: "social-dm-assistant",
    name: "AI Chatbot",
    shortName: "Messaging Chatbot",
    price: 299,
    icon: MessageCircleMore,
    badge: "Messaging automation",
    description:
      "Respond to customers across WhatsApp, Instagram and Messenger, answer product questions and route conversations to your team.",
    features: [
      "WhatsApp, Instagram, and Messenger",
      "Automatic product and service Q&A",
      "Lead capture inside chat",
      "Team hand-off and escalation",
    ],
    useCases: [
      "Ecommerce brands",
      "Hotels and hospitality",
      "Real estate and professional services",
    ],
  },
] as const;

export type Automation = (typeof automations)[number];
export const getAutomation = (slug: string) => automations.find((item) => item.slug === slug);

export const demoInstances: Array<{
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: string;
  expires: string;
}> = [];
export const demoPayments: Array<{
  id: string;
  client: string;
  automation: string;
  amount: string;
  method: string;
  transaction: string;
  submitted: string;
}> = [];

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
