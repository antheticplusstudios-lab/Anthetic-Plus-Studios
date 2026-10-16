export type ProductSlug = "ai_receptionist" | "lead_capture" | "kb_support" | "messaging_ai";

export const RECEPTIONIST_CAPABILITIES = [
  {
    key: "call_chat_handling",
    label: "24/7 Call & SMS Handling",
    desc: "Answers inbound calls and texts, handles FAQs and follows configured escalation rules.",
  },
  {
    key: "appointment_scheduling",
    label: "Appointment Availability & Booking",
    desc: "Checks connected Google Calendar availability and books confirmed appointments.",
  },
  {
    key: "lead_qualification",
    label: "Lead Intake",
    desc: "Collects caller/contact details and captures the conversation for team follow-up.",
  },
  {
    key: "support_faq",
    label: "Customer Support & FAQs",
    desc: "Answers configured business questions without inventing unavailable information.",
  },
  {
    key: "human_takeover",
    label: "Human Handoff",
    desc: "Routes escalation conversations to the configured round-robin team; voice can dial a configured handoff number.",
  },
] as const;

export const MESSAGING_FEATURES = [
  {
    key: "social_faq",
    label: "Multi-turn Social FAQ",
    desc: "Answers follow-up questions using the saved business profile, products and FAQs.",
  },
  {
    key: "lead_qualification",
    label: "Lead Qualification",
    desc: "Uses configured qualification prompts and captures contact conversations for team handoff.",
  },
  {
    key: "human_takeover",
    label: "Human Handoff",
    desc: "Escalates configured handoff cases to the round-robin team.",
  },
] as const;

export const RECEPTIONIST_CHANNELS = [
  { key: "phone_sms", label: "Phone & SMS", price: 148, featured: true },
] as const;

export const MESSAGING_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp Business API" },
  { key: "messenger", label: "Facebook Messenger" },
  { key: "instagram", label: "Instagram Messaging" },
] as const;

export const MESSAGING_BASE = 79;
export const MESSAGING_PER_EXTRA_CHANNEL = 20;

export const PRODUCTS: Record<ProductSlug, { name: string; tagline: string }> = {
  ai_receptionist: {
    name: "AI Voice & SMS Receptionist",
    tagline: "24/7 voice and SMS front desk",
  },
  lead_capture: {
    name: "AI Lead Capture & Smart Qualifier",
    tagline: "Capture, qualify and route high-intent leads",
  },
  kb_support: {
    name: "AI Knowledge Base Support Agent",
    tagline: "Accurate support grounded in approved business knowledge",
  },
  messaging_ai: {
    name: "AI Social DM & Messaging Assistant",
    tagline: "AI conversations across connected social messaging channels",
  },
};

export const AUTOMATION_LABEL: Record<string, string> = {
  ai_receptionist: "AI Voice & SMS Receptionist",
  lead_capture: "AI Lead Capture & Smart Qualifier",
  kb_support: "AI Knowledge Base Support Agent",
  messaging_ai: "AI Social DM & Messaging Assistant",
};

export const FIELD_LABEL: Record<string, string> = {
  sender_phone: "Sender phone number",
  trx_id: "Transaction ID",
  sender_name: "Sender name",
  bank_reference: "Bank reference",
  wallet_address: "Sending wallet address",
  tx_hash: "Transaction hash",
};

export function embedSnippet(clientId: string, orderId: string | null, token: string) {
  const base =
    (import.meta.env["VITE_APP_URL"] as string | undefined)?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `<script\n  src="${base}/widget.js"\n  data-client-id="${clientId}"\n  data-order-id="${orderId ?? ""}"\n  data-token="${token}"\n  async>\n</script>`;
}
