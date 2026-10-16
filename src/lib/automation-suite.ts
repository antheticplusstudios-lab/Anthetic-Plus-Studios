// The 4 core Anthetic Plus Studios automations + website assistant key-pool limits.
import type { PoolProvider, PoolScope } from "./key-pool";

export type ServiceDef = {
  id: string;
  title: string;
  summary: string;
  needs?: ("twilio" | "calendar" | "payments")[];
};

export const RECEPTIONIST_SERVICES: ServiceDef[] = [
  {
    id: "call_handling",
    title: "Call Handling",
    summary: "Answer 24/7, FAQs, pricing, hours, take messages, transfer to a human.",
    needs: ["twilio"],
  },
  {
    id: "scheduling",
    title: "Appointment & Scheduling",
    summary: "Book, reschedule, cancel, check availability, confirmations and reminders.",
    needs: ["calendar"],
  },
  {
    id: "bookings",
    title: "Booking & Reservations",
    summary: "Rooms, tables, events and tours — check, modify, cancel, confirm.",
  },
  {
    id: "sales_qualification",
    title: "Sales & Lead Qualification",
    summary: "Qualifying questions, budget, location, urgency, hand off hot leads.",
  },
  {
    id: "follow_up",
    title: "Lead Follow-Up & Recovery",
    summary: "Missed calls, unanswered inquiries, unfinished bookings, re-engagement.",
  },
  {
    id: "support",
    title: "Customer Support",
    summary: "Policies, order info, basic complaints, escalation with context.",
  },
  {
    id: "crm_capture",
    title: "Data Collection & CRM",
    summary: "Name, phone, email, needs, budget, status and summary after every chat.",
  },
  {
    id: "payments",
    title: "Payment & Transaction Assistance",
    summary: "Payment links, options, deposits, status and receipts.",
    needs: ["payments"],
  },
  {
    id: "outbound",
    title: "Outbound Calls & Reminders",
    summary: "Reminder, confirmation, follow-up and satisfaction calls.",
    needs: ["twilio"],
  },
  {
    id: "recommendations",
    title: "Personalized Recommendations",
    summary: "Suggest services, packages, slots or properties from customer needs.",
  },
];

export type AutomationDef = {
  scope: PoolScope;
  slug: string;
  title: string;
  tagline: string;
  services: ServiceDef[];
  pools: { provider: PoolProvider; label: string; maxKeys: number }[];
};

export const AUTOMATION_SUITE: AutomationDef[] = [
  {
    scope: "ai_receptionist",
    slug: "ai-receptionist",
    title: "AI Receptionist",
    tagline: "Greets and assists customers across calls, chat and messages.",
    services: RECEPTIONIST_SERVICES,
    pools: [
      { provider: "llm", label: "AI model keys", maxKeys: 20 },
      { provider: "inworld", label: "Inworld voice keys", maxKeys: 10 },
    ],
  },
  {
    scope: "workflow_automation",
    slug: "workflow-automation",
    title: "Workflow Automation",
    tagline: "Automates notifications, CRM updates, lead assignment and reports.",
    services: [
      { id: "notifications", title: "Notifications", summary: "Send alerts when events happen." },
      { id: "crm_sync", title: "CRM Updates", summary: "Create and update records automatically." },
      {
        id: "lead_routing",
        title: "Lead Assignment",
        summary: "Round-robin new leads to your team.",
      },
      { id: "reports", title: "Reports", summary: "Scheduled summaries delivered by email." },
    ],
    pools: [{ provider: "llm", label: "AI model keys", maxKeys: 20 }],
  },
  {
    scope: "ai_sales_agent",
    slug: "ai-sales-agent",
    title: "AI Sales Agent",
    tagline: "Engages, qualifies and follows up with prospects toward a purchase.",
    services: [
      {
        id: "engage",
        title: "Prospect Engagement",
        summary: "Start and continue sales conversations.",
      },
      {
        id: "qualify",
        title: "Lead Qualification",
        summary: "Budget, need, timeline and fit scoring.",
      },
      {
        id: "objections",
        title: "Objection Handling",
        summary: "Answers common doubts from your knowledge.",
      },
      { id: "follow_up", title: "Follow-Ups", summary: "Timed nudges until the prospect decides." },
    ],
    pools: [{ provider: "llm", label: "AI model keys", maxKeys: 20 }],
  },
  {
    scope: "message_ai",
    slug: "message-ai",
    title: "Message AI Automation",
    tagline: "Replies on WhatsApp, Messenger, Telegram and more.",
    services: [
      { id: "auto_reply", title: "Auto Replies", summary: "Instant answers to incoming messages." },
      { id: "faq", title: "FAQs", summary: "Answers from your trained knowledge." },
      { id: "capture", title: "Lead Capture", summary: "Collects contact details in chat." },
      { id: "handoff", title: "Human Handoff", summary: "Routes complex chats to staff." },
    ],
    pools: [
      { provider: "llm", label: "AI model keys", maxKeys: 20 },
      { provider: "twilio", label: "Twilio messaging", maxKeys: 5 },
    ],
  },
];

export const WEBSITE_ASSISTANT_POOLS = [
  { provider: "llm" as const, label: "AI model keys", maxKeys: 20 },
  { provider: "inworld" as const, label: "Inworld voice keys", maxKeys: 5 },
];

export function automationBySlug(slug: string) {
  return AUTOMATION_SUITE.find((a) => a.slug === slug) ?? null;
}

/** Services a client can run with zero setup given what is connected. */
export function readyServices(def: AutomationDef, connected: Set<string>) {
  return def.services.map((s) => ({
    ...s,
    ready: (s.needs ?? []).every((n) => connected.has(n)),
    missing: (s.needs ?? []).filter((n) => !connected.has(n)),
  }));
}

/** Suite-wide default service switches are stored under a fixed id per automation. */
export const SUITE_DEFAULTS_ID: Record<PoolScope, string> = {
  ai_receptionist: "00000000-0000-4000-8000-000000000001",
  workflow_automation: "00000000-0000-4000-8000-000000000002",
  ai_sales_agent: "00000000-0000-4000-8000-000000000003",
  message_ai: "00000000-0000-4000-8000-000000000004",
  website_assistant: "00000000-0000-4000-8000-000000000005",
};

/** Merge saved switches over defaults: a service is on unless explicitly switched off. */
export function resolveServiceSwitches(
  def: AutomationDef,
  saved: { service_id: string; enabled: boolean }[],
) {
  const map = new Map(saved.map((r) => [r.service_id, r.enabled]));
  return Object.fromEntries(def.services.map((s) => [s.id, map.get(s.id) ?? true])) as Record<
    string,
    boolean
  >;
}
