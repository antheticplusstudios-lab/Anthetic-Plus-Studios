/**
 * Supported tool catalog per automation. Client tool requests can only ever
 * enable entries from this list — no generated code is executed. Each tool
 * declares the permission scopes it needs and whether it needs owner approval.
 */
import type { EngineKind } from "@/lib/automations";

export type ToolScope =
  | "read:knowledge"
  | "read:catalog"
  | "read:availability"
  | "write:bookings"
  | "write:orders"
  | "write:leads"
  | "send:messages"
  | "create:payment_link"
  | "handoff:human"
  | "read:payments"
  | "place:calls";

export type IntegrationNeed = "calendar" | "payments" | "sms" | "telephony" | "email" | "crm";

export const INTEGRATION_LABEL: Record<IntegrationNeed, string> = {
  calendar: "Google Calendar connection",
  payments: "Payment provider (Stripe/Paddle) or a hosted payment link",
  sms: "Twilio SMS connection",
  telephony: "Twilio voice number",
  email: "Email delivery (Resend)",
  crm: "CRM or lead webhook URL",
};

export type CatalogTool = {
  id: string;
  label: string;
  description: string;
  scopes: ToolScope[];
  /** Requires a connected external provider before it can run. */
  requiresIntegration?: IntegrationNeed;
  /** Side-effecting tools always need staff approval before going live. */
  sideEffect: boolean;
};

const shared: CatalogTool[] = [
  {
    id: "search_knowledge",
    label: "Search approved knowledge",
    description: "Answer from the business's approved knowledge only.",
    scopes: ["read:knowledge"],
    sideEffect: false,
  },
  {
    id: "human_handoff",
    label: "Hand off to a human",
    description: "Escalate the conversation to staff with a summary.",
    scopes: ["handoff:human"],
    sideEffect: true,
  },
];

export const TOOL_CATALOG: Record<EngineKind, CatalogTool[]> = {
  ai_receptionist: [
    ...shared,
    // 1. Call handling
    {
      id: "take_message",
      label: "Take a message",
      description: "Record the caller's message and details for staff.",
      scopes: ["write:leads"],
      sideEffect: true,
    },
    {
      id: "transfer_call",
      label: "Transfer call to a human",
      description: "Forward a live call to the business's handoff number.",
      scopes: ["handoff:human"],
      requiresIntegration: "telephony",
      sideEffect: true,
    },
    // 2. Appointments & 3. Reservations
    {
      id: "check_availability",
      label: "Check availability",
      description: "Look up open time slots.",
      scopes: ["read:availability"],
      requiresIntegration: "calendar",
      sideEffect: false,
    },
    {
      id: "create_booking",
      label: "Create booking / appointment",
      description: "Reserve a slot after the customer confirms details.",
      scopes: ["write:bookings"],
      requiresIntegration: "calendar",
      sideEffect: true,
    },
    {
      id: "reschedule_booking",
      label: "Reschedule booking",
      description: "Move an existing booking after confirmation.",
      scopes: ["write:bookings"],
      requiresIntegration: "calendar",
      sideEffect: true,
    },
    {
      id: "cancel_booking",
      label: "Cancel booking",
      description: "Cancel an existing booking after confirmation.",
      scopes: ["write:bookings"],
      requiresIntegration: "calendar",
      sideEffect: true,
    },
    {
      id: "create_reservation",
      label: "Reservations (rooms, tables, events, tours)",
      description: "Hold a reservation with party size, dates and options.",
      scopes: ["write:bookings"],
      requiresIntegration: "calendar",
      sideEffect: true,
    },
    {
      id: "list_services",
      label: "List products & services",
      description: "Show the business's offerings, prices and options.",
      scopes: ["read:catalog"],
      sideEffect: false,
    },
    {
      id: "create_order",
      label: "Create order",
      description: "Create an order with items, price summary and customer details.",
      scopes: ["write:orders"],
      sideEffect: true,
    },
    // 4. Sales & qualification
    {
      id: "qualify_lead",
      label: "Qualify lead",
      description: "Ask qualifying questions: needs, budget, location, urgency.",
      scopes: ["write:leads"],
      sideEffect: false,
    },
    {
      id: "capture_lead",
      label: "Capture lead to CRM",
      description: "Save caller details and qualification answers.",
      scopes: ["write:leads"],
      sideEffect: true,
    },
    // 5. Follow-up & recovery
    {
      id: "followup_missed_call",
      label: "Missed-call text-back",
      description: "Text callers the business missed and continue by SMS.",
      scopes: ["send:messages"],
      requiresIntegration: "sms",
      sideEffect: true,
    },
    {
      id: "send_sms_reminder",
      label: "Send SMS reminder / follow-up",
      description: "Send a confirmation, reminder or recovery message.",
      scopes: ["send:messages"],
      requiresIntegration: "sms",
      sideEffect: true,
    },
    // 7. CRM
    {
      id: "sync_crm",
      label: "Push to CRM / spreadsheet",
      description: "Send the interaction summary to the connected CRM webhook.",
      scopes: ["write:leads"],
      requiresIntegration: "crm",
      sideEffect: true,
    },
    // 8. Payments
    {
      id: "create_payment_link",
      label: "Send payment link",
      description: "Send a hosted checkout link; never handles card numbers.",
      scopes: ["create:payment_link"],
      requiresIntegration: "payments",
      sideEffect: true,
    },
    {
      id: "check_payment_status",
      label: "Confirm payment status",
      description: "Read verified payment status from the provider.",
      scopes: ["read:payments"],
      requiresIntegration: "payments",
      sideEffect: false,
    },
    {
      id: "send_receipt",
      label: "Send invoice / receipt",
      description: "Email a receipt after a verified payment.",
      scopes: ["send:messages"],
      requiresIntegration: "email",
      sideEffect: true,
    },
    // 9. Outbound
    {
      id: "outbound_reminder_call",
      label: "Outbound reminder calls",
      description: "Call customers to confirm appointments and record answers.",
      scopes: ["place:calls"],
      requiresIntegration: "telephony",
      sideEffect: true,
    },
    // 10. Recommendations
    {
      id: "recommend_offering",
      label: "Personalized recommendations",
      description: "Suggest offerings, packages or slots based on stated needs.",
      scopes: ["read:catalog"],
      sideEffect: false,
    },
  ],
  lead_capture: [
    ...shared,
    {
      id: "capture_lead",
      label: "Capture lead",
      description: "Save contact details and answers.",
      scopes: ["write:leads"],
      sideEffect: true,
    },
    {
      id: "score_lead",
      label: "Qualify & score lead",
      description: "Score the lead against the business's criteria.",
      scopes: ["write:leads"],
      sideEffect: false,
    },
    {
      id: "send_email_followup",
      label: "Email follow-up",
      description: "Send a follow-up email to the lead.",
      scopes: ["send:messages"],
      requiresIntegration: "email",
      sideEffect: true,
    },
    {
      id: "sync_crm",
      label: "Sync to CRM",
      description: "Push qualified leads to the connected CRM.",
      scopes: ["write:leads"],
      requiresIntegration: "crm",
      sideEffect: true,
    },
  ],
  kb_support: [
    ...shared,
    {
      id: "create_ticket",
      label: "Create support ticket",
      description: "Log an unresolved issue for staff.",
      scopes: ["handoff:human"],
      sideEffect: true,
    },
    {
      id: "suggest_articles",
      label: "Suggest help articles",
      description: "Link the most relevant approved articles.",
      scopes: ["read:knowledge"],
      sideEffect: false,
    },
  ],
  messaging_ai: [
    ...shared,
    {
      id: "capture_lead",
      label: "Capture lead from DM",
      description: "Save the contact from a social conversation.",
      scopes: ["write:leads"],
      sideEffect: true,
    },
    {
      id: "send_dm_reply",
      label: "Auto-reply to DMs",
      description: "Reply to incoming messages on connected channels.",
      scopes: ["send:messages"],
      sideEffect: true,
    },
    {
      id: "list_services",
      label: "Share products & services",
      description: "Answer with offerings and prices.",
      scopes: ["read:catalog"],
      sideEffect: false,
    },
  ],
};

export type RawProposal = {
  summary: string;
  tools: Array<{ id: string; reason: string; inputs: string[] }>;
  unsupported: string[];
};

export type ValidatedProposal = {
  summary: string;
  tools: Array<
    CatalogTool & {
      reason: string;
      inputs: string[];
      needsApproval: boolean;
      setupMissing: string | null;
    }
  >;
  unsupported: string[];
  scopes: ToolScope[];
};

/** Deterministic guard: drops anything outside this automation's catalog and computes scopes/approval. */
export function validateProposal(
  kind: EngineKind,
  raw: RawProposal,
  connected: ReadonlySet<string> = new Set(),
): ValidatedProposal {
  const catalog = new Map(TOOL_CATALOG[kind].map((t) => [t.id, t]));
  const seen = new Set<string>();
  const unsupported = raw.unsupported.slice(0, 10).map((s) => s.slice(0, 200));
  const tools: ValidatedProposal["tools"] = [];
  for (const t of raw.tools.slice(0, 12)) {
    const def = catalog.get(t.id);
    if (!def) {
      unsupported.push(`Unknown tool "${String(t.id).slice(0, 40)}"`);
      continue;
    }
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    tools.push({
      ...def,
      reason: String(t.reason ?? "").slice(0, 300),
      inputs: (t.inputs ?? []).slice(0, 10).map((s) => String(s).slice(0, 60)),
      needsApproval: true,
      setupMissing:
        def.requiresIntegration && !connected.has(def.requiresIntegration)
          ? def.requiresIntegration
          : null,
    });
  }
  return {
    summary: raw.summary.slice(0, 500),
    tools,
    unsupported,
    scopes: [...new Set(tools.flatMap((t) => t.scopes))],
  };
}

/** The ten AI Receptionist service areas (from the AI Receptionist Core Services brief) and the tools behind each. */
export const RECEPTIONIST_SERVICES: Array<{
  id: string;
  title: string;
  summary: string;
  tools: string[];
}> = [
  {
    id: "call_handling",
    title: "Call Handling",
    summary: "24/7 answers, FAQs, pricing, hours/location, messages, transfers.",
    tools: ["search_knowledge", "list_services", "take_message", "transfer_call"],
  },
  {
    id: "scheduling",
    title: "Appointment & Scheduling",
    summary: "Book, reschedule, cancel, confirm and remind.",
    tools: [
      "check_availability",
      "create_booking",
      "reschedule_booking",
      "cancel_booking",
      "send_sms_reminder",
    ],
  },
  {
    id: "reservations",
    title: "Booking & Reservations",
    summary: "Rooms, tables, events and tours with confirmation.",
    tools: ["check_availability", "create_reservation", "cancel_booking"],
  },
  {
    id: "sales",
    title: "Sales & Lead Qualification",
    summary: "Needs, budget, location, urgency; book sales calls; hand off hot leads.",
    tools: ["qualify_lead", "capture_lead", "create_booking", "human_handoff"],
  },
  {
    id: "follow_up",
    title: "Lead Follow-Up & Recovery",
    summary: "Missed-call text-back, unfinished bookings, re-engagement.",
    tools: ["followup_missed_call", "send_sms_reminder"],
  },
  {
    id: "support",
    title: "Customer Support",
    summary: "Policies, order info, basic complaints, escalation.",
    tools: ["search_knowledge", "human_handoff", "take_message"],
  },
  {
    id: "crm",
    title: "Data Collection & CRM",
    summary: "Capture contact, needs, budget, status and summary; push to CRM.",
    tools: ["capture_lead", "sync_crm"],
  },
  {
    id: "payments",
    title: "Payment & Transaction Assistance",
    summary: "Payment links, options, verified status, receipts.",
    tools: ["create_order", "create_payment_link", "check_payment_status", "send_receipt"],
  },
  {
    id: "outbound",
    title: "Outbound Calls & Reminders",
    summary: "Confirmation, reminder, payment and re-engagement calls.",
    tools: ["outbound_reminder_call", "send_sms_reminder"],
  },
  {
    id: "recommendations",
    title: "Personalized Recommendations",
    summary: "Packages, properties, rooms and slots matched to needs.",
    tools: ["recommend_offering", "check_availability"],
  },
];
