export type ProductSlug = "ai_receptionist" | "messaging_ai";

export const RECEPTIONIST_CAPABILITIES = [
  { key: "call_chat_handling", label: "24/7 Call & Chat Handling", desc: "FAQs, pricing, hours, concurrent calls, escalation to a human." },
  { key: "appointment_scheduling", label: "Appointment & Scheduling", desc: "Live calendar availability, booking, rescheduling, confirmations." },
  { key: "booking_reservations", label: "Booking & Reservations", desc: "Table, room, event or tour bookings with live availability." },
  { key: "lead_qualification", label: "Sales & Lead Qualification", desc: "Budget, location, timeline and urgency questions to score prospects." },
  { key: "lead_followup", label: "Lead Follow-up & Recovery", desc: "Auto-texts missed calls, re-engages abandoned bookings." },
  { key: "support_faq", label: "Customer Support & FAQs", desc: "Policies, basic support and complaint intake before handoff." },
  { key: "crm_sync", label: "Data Collection & CRM Sync", desc: "Extracts name, phone, email, budget and summary into the CRM." },
  { key: "payment_assist", label: "Payment & Transaction Assistance", desc: "Sends payment links and invoices, verifies deposits." },
  { key: "outbound_reminders", label: "Outbound Calls & Reminders", desc: "Automated reminders for appointments, invoices and surveys." },
  { key: "recommendations", label: "Personalized Recommendations", desc: "Suggests packages from budget, location and history." },
] as const;

export const MESSAGING_FEATURES = [
  { key: "catalog_sharing", label: "Product Catalog & Menu Sharing", desc: "Share products and menus inside the chat." },
  { key: "order_intake", label: "Order Intake & Lead Capture", desc: "Takes orders and captures leads automatically." },
  { key: "social_faq", label: "Multi-turn Social FAQ", desc: "Answers follow-up questions naturally." },
  { key: "human_takeover", label: "Media Dispatch & Human Takeover", desc: "Sends PDFs/images and lets staff take over." },
] as const;

export const RECEPTIONIST_CHANNELS = [
  { key: "web", label: "Web-Based Only", price: 99 },
  { key: "phone", label: "Phone & SMS Only", price: 99 + 49 },
  { key: "hybrid", label: "Hybrid Omni-Channel", price: 99 + 79, featured: true },
] as const;

export const MESSAGING_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp Business API" },
  { key: "messenger", label: "Facebook Messenger" },
  { key: "telegram", label: "Telegram Bot API" },
] as const;

export const MESSAGING_BASE = 79;
export const MESSAGING_PER_EXTRA_CHANNEL = 20;

export const PRODUCTS: Record<ProductSlug, { name: string; tagline: string }> = {
  ai_receptionist: { name: "AI Receptionist", tagline: "24/7 voice, SMS & web front desk" },
  messaging_ai: { name: "Messaging AI Automation", tagline: "WhatsApp, Messenger & Telegram in one inbox" },
};

export const AUTOMATION_LABEL: Record<string, string> = {
  ai_receptionist: "AI Receptionist",
  messaging_ai: "Messaging AI Automation",
  web_chatbot: "AI Sales Agent",
  workflow_automation: "Workflow Automation",
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
  const base = (import.meta.env["VITE_APP_URL"] as string | undefined)?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  return `<script\n  src="${base}/widget.js"\n  data-client-id="${clientId}"\n  data-order-id="${orderId ?? ""}"\n  data-token="${token}"\n  async>\n</script>`;
}
