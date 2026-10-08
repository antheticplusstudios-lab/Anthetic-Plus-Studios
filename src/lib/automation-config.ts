// Automation configuration contract. Stored at DB2 client_automations.config.settings (jsonb, existing column).
// Pure: used by the worker (runtime), checkout (collection), control rooms (editing) and dashboards (progress/badges).
import type { EngineKind } from "@/lib/automations";

export type Settings = Record<string, string | number | boolean | undefined>;

const s = (v: unknown) =>
  typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : String(v);
const has = (st: Settings, k: string) => s(st[k]).length > 0;

/** Steps each product's order flow collects; also drives setup progress. */
export const SETUP_STEPS: Record<
  EngineKind,
  { key: string; label: string; fields: string[]; optional?: string[] }[]
> = {
  ai_receptionist: [
    { key: "profile", label: "Business profile", fields: ["business_info"] },
    { key: "hours", label: "Business hours", fields: ["hours"], optional: ["after_hours_message"] },
    {
      key: "phone",
      label: "Phone, greeting & SMS",
      fields: ["greeting", "sms_behavior"],
      optional: ["phone_number", "voice_lang", "voice_rate"],
    },
    { key: "booking", label: "Booking rules", fields: ["appointment_rules"] },
    {
      key: "escalation",
      label: "Call handling & escalation",
      fields: ["escalation_rules"],
      optional: ["handoff_contact", "system_prompt"],
    },
  ],
  lead_capture: [
    { key: "profile", label: "Business profile", fields: ["business_info"] },
    { key: "fields", label: "Lead source & fields", fields: ["lead_source", "required_fields"] },
    { key: "questions", label: "Qualification questions", fields: ["qualification_questions"] },
    {
      key: "hot",
      label: "Hot lead rules",
      fields: ["hot_threshold"],
      optional: ["warm_threshold", "hot_keywords"],
    },
    {
      key: "routing",
      label: "Lead routing & notifications",
      fields: ["routing", "notify_email"],
      optional: ["follow_up", "webhook_url", "escalation_rules"],
    },
  ],
  kb_support: [
    { key: "profile", label: "Business profile", fields: ["business_info"] },
    {
      key: "sources",
      label: "Knowledge sources",
      fields: ["knowledge_sources"],
      optional: ["support_channels"],
    },
    {
      key: "faq",
      label: "Answer style & rules",
      fields: ["system_prompt"],
      optional: ["answer_style", "confidence_threshold"],
    },
    { key: "citations", label: "Citation behaviour", fields: ["citation_mode"] },
    {
      key: "handoff",
      label: "Human handoff & fallback",
      fields: ["handoff_message"],
      optional: ["escalation_rules"],
    },
  ],
  messaging_ai: [
    { key: "profile", label: "Business profile", fields: ["business_info"] },
    { key: "channels", label: "Channels", fields: ["channels"] },
    {
      key: "behaviour",
      label: "Brand tone & behaviour",
      fields: ["brand_tone", "dm_prompt"],
      optional: ["rate_limit_per_hour"],
    },
    {
      key: "products",
      label: "Products & FAQs",
      fields: ["products"],
      optional: ["faqs", "qualification_questions"],
    },
    { key: "handoff", label: "Handoff & escalation", fields: ["handoff_rules"] },
  ],
};

export type DeploymentState =
  "active" | "testing" | "paused" | "expired" | "disabled" | "provisioning" | "unknown";

export function setupProgress(
  kind: EngineKind,
  settings: Settings,
  state: DeploymentState,
  hasSuccessfulRun: boolean,
) {
  const steps = SETUP_STEPS[kind].map((st) => ({
    key: st.key,
    label: st.label,
    done: st.fields.every((f) => has(settings, f)),
  }));
  steps.push({ key: "testing", label: "Testing", done: hasSuccessfulRun });
  steps.push({ key: "activation", label: "Activation", done: state === "active" });
  return { steps, done: steps.filter((x) => x.done).length, total: steps.length };
}

/** Customer-facing status derived only from backend state. */
export function customerStatus(
  state: DeploymentState,
  progress: { done: number; total: number },
  lastError: string | null,
) {
  if (state === "expired") return "EXPIRED";
  if (state === "paused") return "PAUSED";
  if (state === "provisioning") return "PROCESSING";
  if (state === "disabled") return "ACTION REQUIRED";
  if (state === "testing") return "TESTING";
  if (progress.done < progress.total - 2) return "SETUP REQUIRED";
  if (lastError) return "ACTION REQUIRED";
  return state === "active" ? "ACTIVE" : "PROCESSING";
}

const SHORT: Record<EngineKind, string> = {
  ai_receptionist: "VOICE RECEPTIONIST",
  lead_capture: "LEAD QUALIFIER",
  kb_support: "SUPPORT AGENT",
  messaging_ai: "SOCIAL DM",
};
export function automationBadge(kind: EngineKind, state: DeploymentState) {
  return `${SHORT[kind]} · ${state.toUpperCase()}`;
}

// ---------- runtime helpers (consumed by automation-engine.server.ts) ----------

function block(title: string, v: unknown) {
  const t = s(v);
  return t ? `\n\n${title}:\n${t}` : "";
}

export function receptionistPrompt(st: Settings) {
  return (
    (s(st.system_prompt) ||
      "You are a polite business receptionist. Answer briefly and collect the caller's name and reason for contact.") +
    block("Business", st.business_info) +
    block("Hours", st.hours) +
    block("Services", st.services) +
    block("FAQs", st.faqs) +
    block("Appointment rules", st.appointment_rules) +
    block("SMS behaviour", st.sms_behavior) +
    block("Greeting (use for the first reply)", st.greeting) +
    block("Outside business hours say", st.after_hours_message) +
    block("Escalate to a human when", st.escalation_rules) +
    block("Human handoff contact", st.handoff_contact) +
    "\n\nNever invent prices, availability or bookings that are not stated above."
  );
}

/** True when the inbound message matches a configured escalation keyword (comma/newline separated). */
export function matchesEscalation(text: string, rules: unknown) {
  const words = s(rules)
    .split(/[,\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 2);
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

export function requiredLeadFields(st: Settings) {
  const f = s(st.required_fields)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return f.length ? f : ["email|phone"];
}

export function scoreLead(i: Record<string, unknown>, st: Settings) {
  let score = 0;
  if (i.email) score += 25;
  if (i.phone) score += 25;
  if (i.company) score += 15;
  const msg = String(i.message ?? "");
  const kw = s(st.hot_keywords) || "budget,price,quote,buy,demo,urgent";
  if (kw.split(",").some((k) => k.trim() && msg.toLowerCase().includes(k.trim().toLowerCase())))
    score += 25;
  if (msg.length > 80) score += 10;
  score = Math.min(100, score);
  const hot = Number(st.hot_threshold ?? 60) || 60;
  const warm = Number(st.warm_threshold ?? 35) || 35;
  return {
    score,
    tier: score >= hot ? "hot" : score >= warm ? "warm" : ("cold" as "hot" | "warm" | "cold"),
  };
}

export function missingLeadFields(i: Record<string, unknown>, st: Settings) {
  return requiredLeadFields(st).filter((f) =>
    f === "email|phone" ? !i.email && !i.phone : !s(i[f]),
  );
}

export function kbPrompt(st: Settings, context: string) {
  const cite =
    s(st.citation_mode) === "none"
      ? ""
      : "\nCite sources inline as [1], [2] matching the numbered knowledge.";
  const style = s(st.answer_style) ? `\nAnswer style: ${s(st.answer_style)}.` : "";
  return (
    (s(st.system_prompt) || "Answer ONLY from the provided knowledge.") +
    style +
    "\nIf the knowledge does not cover the question, say you will hand it to a person." +
    cite +
    "\n\n" +
    context
  );
}
export function kbMinSimilarity(st: Settings) {
  const v = Number(st.confidence_threshold);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0;
}

/** Max replies per contact per hour; 0 = unlimited. */
export function dmRateLimit(st: Settings) {
  const v = Number(st.rate_limit_per_hour);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function dmChannelAllowed(platform: string, st: Settings) {
  const list = s(st.channels)
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const supported = new Set(["whatsapp", "messenger", "instagram"]);
  return (
    supported.has(platform.toLowerCase()) &&
    (list.length === 0 || list.includes(platform.toLowerCase()))
  );
}
export function dmPrompt(st: Settings) {
  return (
    (s(st.dm_prompt) ||
      "You reply to social media DMs for a business: friendly, short, no prices unless known.") +
    block("Business", st.business_info) +
    block("Products & services", st.products) +
    block("FAQs", st.faqs) +
    block("Brand tone", st.brand_tone) +
    block("Qualify interested buyers by asking", st.qualification_questions) +
    block("Hand off to a human when", st.handoff_rules)
  );
}

export type ConfigField = {
  key: string;
  label: string;
  help: string;
  long?: boolean;
  kind?: "number" | "boolean";
};

/** Product-specific configuration stored at client_automations.config.settings and read by the worker. */
export const CONFIG_FIELDS: Record<EngineKind, ConfigField[]> = {
  ai_receptionist: [
    {
      key: "greeting",
      label: "Greeting",
      help: "First thing callers/texters hear, e.g. 'Thanks for calling Acme…'",
    },
    {
      key: "after_hours_message",
      label: "After-hours message",
      help: "What to say when you're closed.",
    },
    {
      key: "phone_number",
      label: "Business phone number",
      help: "Number to forward or display (optional).",
    },
    {
      key: "voice_lang",
      label: "Voice language",
      help: "e.g. en-US, bn-BD. Browser voice is used by default.",
    },
    { key: "voice_rate", label: "Voice speed (0.5–2)", help: "1 = normal.", kind: "number" },
    {
      key: "handoff_contact",
      label: "Human handoff contact",
      help: "Who takes escalated calls (name / phone).",
    },
    {
      key: "business_info",
      label: "Business information",
      help: "Name, address, what you do.",
      long: true,
    },
    { key: "hours", label: "Operating hours", help: "e.g. Mon–Fri 9:00–17:00" },
    { key: "services", label: "Services", help: "One per line.", long: true },
    { key: "faqs", label: "FAQs", help: "Q: … A: … pairs.", long: true },
    {
      key: "appointment_rules",
      label: "Appointment rules",
      help: "Lead time, slot length, what can be booked.",
      long: true,
    },
    {
      key: "escalation_rules",
      label: "When to hand to a human",
      help: "e.g. complaints, emergencies.",
      long: true,
    },
    { key: "sms_behavior", label: "SMS behaviour", help: "Tone and follow-up rules for texts." },
    {
      key: "system_prompt",
      label: "Extra instructions",
      help: "Added to the receptionist's instructions.",
      long: true,
    },
  ],
  lead_capture: [
    { key: "lead_source", label: "Lead sources", help: "Website form, landing page, ads, chat…" },
    {
      key: "follow_up",
      label: "Follow-up behaviour",
      help: "e.g. 'Text warm leads after 1 day'.",
      long: true,
    },
    {
      key: "webhook_url",
      label: "CRM webhook URL (optional)",
      help: "We record it; delivery is enabled after review.",
    },
    {
      key: "escalation_rules",
      label: "Escalate when",
      help: "Keywords that need a person right away.",
    },
    {
      key: "business_info",
      label: "Business profile",
      help: "Who you are and who you serve.",
      long: true,
    },
    {
      key: "hot_keywords",
      label: "Hot-lead keywords",
      help: "Comma separated words that signal buying intent.",
    },
    {
      key: "qualification_questions",
      label: "Qualification questions",
      help: "One per line (budget, timeline, service…).",
      long: true,
    },
    {
      key: "required_fields",
      label: "Required contact fields",
      help: "Comma separated: email, phone, company",
    },
    {
      key: "hot_threshold",
      label: "Hot lead score (0–100)",
      help: "At or above = hot, routed immediately.",
      kind: "number",
    },
    {
      key: "warm_threshold",
      label: "Warm lead score (0–100)",
      help: "At or above = warm.",
      kind: "number",
    },
    { key: "notify_email", label: "Notify this email", help: "Team inbox for hot leads." },
    {
      key: "routing",
      label: "Routing destination",
      help: "Team or person who gets qualified leads.",
    },
  ],
  kb_support: [
    { key: "answer_style", label: "Answer style", help: "e.g. short and friendly, step-by-step." },
    { key: "support_channels", label: "Supported channels", help: "website chat, email…" },
    { key: "business_info", label: "Business profile", help: "", long: true },
    {
      key: "knowledge_sources",
      label: "Knowledge sources",
      help: "URLs or document names, one per line.",
      long: true,
    },
    { key: "citation_mode", label: "Citations", help: "inline or none" },
    {
      key: "system_prompt",
      label: "Support instructions",
      help: "How answers should sound.",
      long: true,
    },
    {
      key: "confidence_threshold",
      label: "Minimum match confidence (0–1)",
      help: "Below this, the question is handed to a human.",
      kind: "number",
    },
    {
      key: "escalation_rules",
      label: "Escalation rules",
      help: "Topics that always go to a person.",
      long: true,
    },
    {
      key: "handoff_message",
      label: "Handoff message",
      help: "What the customer sees when handed off.",
    },
  ],
  messaging_ai: [
    { key: "brand_tone", label: "Brand tone", help: "e.g. playful, premium, formal." },
    {
      key: "qualification_questions",
      label: "Qualifying questions",
      help: "Questions to ask interested buyers.",
      long: true,
    },
    { key: "faqs", label: "FAQs", help: "", long: true },
    { key: "channels", label: "Channels", help: "instagram, facebook, whatsapp…" },
    { key: "business_info", label: "Business information", help: "", long: true },
    { key: "products", label: "Products & services", help: "", long: true },
    { key: "dm_prompt", label: "Conversation rules", help: "Tone, what not to say.", long: true },
    { key: "handoff_rules", label: "Human handoff", help: "When to pass to a person.", long: true },
    {
      key: "rate_limit_per_hour",
      label: "Max replies per contact per hour",
      help: "",
      kind: "number",
    },
  ],
};

export function fieldDef(kind: EngineKind, key: string): ConfigField {
  return (
    CONFIG_FIELDS[kind].find((f) => f.key === key) ?? {
      key,
      label: key.replace(/_/g, " "),
      help: "",
    }
  );
}

/** Stable short fingerprint of the saved settings (FNV-1a over sorted keys). Pure; no secrets inside settings. */
export function configVersion(st: Settings) {
  const text = JSON.stringify(
    Object.keys(st)
      .sort()
      .map((k) => [k, st[k] ?? null]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------- state derivation shared by dashboards, admin users and badges ----------

export type DeploymentRow = {
  automation_type?: unknown;
  product_type?: unknown;
  status?: unknown;
  run_state?: unknown;
  enabled?: unknown;
  is_active?: unknown;
  expires_at?: unknown;
  config?: unknown;
};
const ENGINE_KINDS: EngineKind[] = [
  "ai_receptionist",
  "lead_capture",
  "kb_support",
  "messaging_ai",
];

export function engineKindOf(row: DeploymentRow): EngineKind | null {
  const t = String(row.automation_type ?? row.product_type ?? "");
  return (ENGINE_KINDS as string[]).includes(t) ? (t as EngineKind) : null;
}

/** Derives the deployment state ONLY from real DB2 columns. */
export function deploymentStateOf(row: DeploymentRow, now = Date.now()): DeploymentState {
  const states = [row.run_state, row.status].filter(Boolean).map((x) => String(x).toLowerCase());
  if (
    states.includes("expired") ||
    (row.expires_at && new Date(String(row.expires_at)).getTime() < now)
  )
    return "expired";
  if (
    states.some((x) =>
      ["stopped", "disabled", "decommissioned", "killed", "suspended"].includes(x),
    ) ||
    row.enabled === false
  )
    return "disabled";
  if (states.includes("paused")) return "paused";
  if (states.some((x) => ["provisioning", "pending", "pending_verification"].includes(x)))
    return "provisioning";
  if (states.includes("testing")) return "testing";
  if (states.includes("active") && row.is_active !== false) return "active";
  return "unknown";
}

export function settingsFromConfig(config: unknown): Settings {
  const c =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  const st = c.settings;
  return st && typeof st === "object" && !Array.isArray(st) ? (st as Settings) : {};
}

export const PRODUCT_BADGE_LABEL: Record<EngineKind, string> = {
  ai_receptionist: "Voice & SMS",
  lead_capture: "Lead Qualifier",
  kb_support: "Knowledge Support",
  messaging_ai: "Social DM",
};

export type UserBadge = { kind: EngineKind; label: string; state: DeploymentState };

/** Badges come only from real deployments (orders alone never award a badge). */
export function userBadges(rows: DeploymentRow[], now = Date.now()): UserBadge[] {
  const rank: Record<DeploymentState, number> = {
    active: 0,
    testing: 1,
    provisioning: 2,
    paused: 3,
    expired: 4,
    disabled: 5,
    unknown: 6,
  };
  const best = new Map<EngineKind, DeploymentState>();
  for (const r of rows) {
    const kind = engineKindOf(r);
    if (!kind) continue;
    const st = deploymentStateOf(r, now);
    const prev = best.get(kind);
    if (!prev || rank[st] < rank[prev]) best.set(kind, st);
  }
  return ENGINE_KINDS.filter((k) => best.has(k)).map((k) => ({
    kind: k,
    label: PRODUCT_BADGE_LABEL[k],
    state: best.get(k)!,
  }));
}

/** Next action a customer must take, derived from progress + state. */
export function nextAction(
  state: DeploymentState,
  progress: { steps: { done: boolean; label: string }[] },
  lastError: string | null,
) {
  if (state === "expired") return "Renew to resume service";
  if (state === "provisioning") return "Waiting for payment verification";
  if (state === "paused") return "Paused — contact support to resume";
  if (state === "disabled") return "Disabled — contact support";
  const missing = progress.steps.find(
    (x) => !x.done && x.label !== "Testing" && x.label !== "Activation",
  );
  if (missing) return `Complete: ${missing.label}`;
  if (lastError) return "Review the latest error";
  if (state === "testing") return "In testing — we'll activate after checks pass";
  return state === "active" ? "No action needed" : "Waiting for activation";
}
