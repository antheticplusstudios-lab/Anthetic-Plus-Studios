// Admin catalog for the four executable customer automation engines.
// LLM credentials are managed centrally in AI Infrastructure (DB3); only Inworld TTS
// credentials belong in the per-automation voice key pool.
import type { PoolProvider, PoolScope } from "./key-pool";

export type ServiceDef = {
  id: string;
  title: string;
  summary: string;
  needs?: ("twilio" | "calendar" | "payments" | "email" | "meta")[];
};

export const RECEPTIONIST_SERVICES: ServiceDef[] = [
  { id: "call_handling", title: "Phone call handling", summary: "Receive calls, greet callers, answer configured FAQs and record the conversation.", needs: ["twilio"] },
  { id: "faq", title: "Business information & FAQs", summary: "Answer from the business profile, hours, services and configured FAQs." },
  { id: "appointments", title: "Appointment availability & booking", summary: "Check a requested time and create an appointment in the connected Google Calendar.", needs: ["calendar"] },
  { id: "conversation_logging", title: "Conversation logging", summary: "Store caller identity and conversation history for staff follow-up." },
  { id: "escalation", title: "Human escalation", summary: "Escalate configured phrases and assign the conversation to the client's Round Robin team." },
  { id: "sms_replies", title: "SMS responses", summary: "Send the receptionist response back to the caller by SMS.", needs: ["twilio"] },
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
    tagline: "Handles inbound phone conversations, configured FAQs, appointment checks and staff escalation.",
    services: RECEPTIONIST_SERVICES,
    pools: [],
  },
  {
    // The database scope is retained for backwards compatibility; this is the kb_support engine.
    scope: "workflow_automation",
    slug: "workflow-automation",
    title: "AI Customer Support Agent",
    tagline: "Answers from the client's approved knowledge base and creates a staff escalation when it cannot answer safely.",
    services: [
      { id: "knowledge_answers", title: "Knowledge-grounded answers", summary: "Retrieve approved client knowledge and answer using the configured AI model." },
      { id: "source_citations", title: "Source citations", summary: "Include numbered source references when citation mode is enabled." },
      { id: "knowledge_gap_escalation", title: "Knowledge-gap escalation", summary: "Create a support ticket when no sufficiently relevant knowledge is found." },
      { id: "staff_assignment", title: "Staff assignment", summary: "Assign escalated support tickets to the client's Round Robin team." },
      { id: "conversation_history", title: "Conversation history", summary: "Keep support conversation and message history for follow-up." },
    ],
    pools: [],
  },
  {
    // The database scope is retained for backwards compatibility; this is the lead_capture engine.
    scope: "ai_sales_agent",
    slug: "ai-sales-agent",
    title: "AI Lead Capture & Qualifier",
    tagline: "Validates lead details, scores and tiers prospects, assigns qualified leads and triggers configured follow-up actions.",
    services: [
      { id: "lead_capture", title: "Lead capture & validation", summary: "Validate configured required fields and save the lead to the client's records." },
      { id: "lead_scoring", title: "Lead scoring & qualification", summary: "Score contact completeness, company details and configured buying-intent keywords." },
      { id: "lead_assignment", title: "Qualified lead assignment", summary: "Send hot leads to the client's Round Robin team." },
      { id: "sms_followup", title: "SMS follow-up", summary: "Send the configured follow-up message to qualified leads with a phone number.", needs: ["twilio"] },
      { id: "email_notifications", title: "Email notifications", summary: "Notify the configured business email about qualified leads.", needs: ["email"] },
      { id: "lead_webhook", title: "Lead webhooks", summary: "POST lead.created events to the client's configured webhook URL." },
    ],
    // Lead scoring currently uses deterministic rules, not an LLM call or a per-scope API key.
    pools: [],
  },
  {
    // The database scope is retained for backwards compatibility; this is the messaging_ai engine.
    scope: "message_ai",
    slug: "message-ai",
    title: "Social & Messaging AI",
    tagline: "Replies to supported WhatsApp, Messenger and Instagram direct messages using the client's business context.",
    services: [
      { id: "supported_channels", title: "WhatsApp, Messenger & Instagram", summary: "Receive and reply through connected Meta messaging channels.", needs: ["meta"] },
      { id: "faq_replies", title: "Business FAQs & product answers", summary: "Answer using the configured business profile, products, FAQs and brand tone." },
      { id: "conversation_records", title: "Conversation records", summary: "Store inbound messages, assistant replies and delivery status." },
      { id: "contact_rate_limit", title: "Per-contact rate limits", summary: "Apply the configured maximum replies per contact per hour." },
      { id: "human_handoff", title: "Human handoff", summary: "Escalate configured messages and assign the conversation to the client's Round Robin team." },
    ],
    // Messaging uses Meta's Graph API directly; Twilio is not its channel adapter.
    pools: [],
  },
];

export const WEBSITE_ASSISTANT_POOLS = [
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

/** Legacy DB rows are retained; these IDs are platform-level catalog identifiers. */
export const SUITE_DEFAULTS_ID: Record<PoolScope, string> = {
  ai_receptionist: "00000000-0000-4000-8000-000000000001",
  workflow_automation: "00000000-0000-4000-8000-000000000002",
  ai_sales_agent: "00000000-0000-4000-8000-000000000003",
  message_ai: "00000000-0000-4000-8000-000000000004",
  website_assistant: "00000000-0000-4000-8000-000000000005",
};

export function resolveServiceSwitches(
  def: AutomationDef,
  saved: { service_id: string; enabled: boolean }[],
) {
  const map = new Map(saved.map((r) => [r.service_id, r.enabled]));
  return Object.fromEntries(def.services.map((s) => [s.id, map.get(s.id) ?? true])) as Record<string, boolean>;
}
