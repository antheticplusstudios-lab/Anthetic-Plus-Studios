// Shared catalog of every key pool in the platform, grouped per automation.
// Mirrors AUTOMATION_SUITE but for admin key management (keys live in DB2, never in code).
import { AUTOMATION_SUITE, WEBSITE_ASSISTANT_POOLS } from "./automation-suite";
import type { PoolProvider, PoolScope } from "./key-pool";

export type PoolDef = {
  provider: PoolProvider;
  label: string;
  maxKeys: number;
  hint: string;
  /** format help shown in the add dialog */
  placeholder: string;
};

export type ScopeGroup = { scope: PoolScope; title: string; tagline: string; pools: PoolDef[] };

const PROVIDER_HINTS: Record<PoolProvider, { hint: string; placeholder: string }> = {
  inworld: {
    hint: "Inworld voice keys power spoken replies. Add up to the limit; rotation switches keys automatically when one hits its limit.",
    placeholder: "Inworld API key",
  },
  llm: {
    hint: "AI model keys power thinking and text. OpenAI-style keys work; rotation switches keys automatically on limits.",
    placeholder: "sk-...",
  },
  resend: {
    hint: "Resend keys send email. Each platform keeps its own sending identity.",
    placeholder: "re_...",
  },
  twilio: {
    hint: "Twilio powers phone calls and SMS. Use Account SID : Auth Token.",
    placeholder: "ACxxxxxxxx:your-auth-token",
  },
};

const ORDER: PoolScope[] = [
  "ai_receptionist",
  "workflow_automation",
  "ai_sales_agent",
  "message_ai",
  "website_assistant",
];

function poolsFor(scope: PoolScope) {
  const source =
    scope === "website_assistant"
      ? WEBSITE_ASSISTANT_POOLS
      : (AUTOMATION_SUITE.find((a) => a.scope === scope)?.pools ?? AUTOMATION_SUITE[0]!.pools);
  return source.map((p) => ({ ...p, ...PROVIDER_HINTS[p.provider] }));
}

const TITLES: Record<PoolScope, { title: string; tagline: string }> = {
  ai_receptionist: {
    title: "AI Receptionist",
    tagline: "Voice + brain keys for the front-desk automation.",
  },
  workflow_automation: {
    title: "Workflow Automation",
    tagline: "Brain keys for background business automation.",
  },
  ai_sales_agent: {
    title: "AI Sales Agent",
    tagline: "Brain keys for qualifying and following up leads.",
  },
  message_ai: {
    title: "Message AI Automation",
    tagline: "Brain + messaging keys for WhatsApp, Messenger and Telegram.",
  },
  website_assistant: {
    title: "Website Assistant",
    tagline: "Brain + voice keys for the on-site assistant widget.",
  },
};

export const SCOPE_GROUPS: ScopeGroup[] = ORDER.map((scope) => ({
  scope,
  ...TITLES[scope],
  pools: poolsFor(scope),
}));

export function scopeGroup(scope: string) {
  return SCOPE_GROUPS.find((g) => g.scope === scope) ?? null;
}

export const KEY_POOL_VIEW_FIELDS = [
  "id",
  "label",
  "enabled",
  "uses",
  "failures",
  "cooldownUntil",
  "createdAt",
] as const;

export type KeyPoolView = {
  id: string;
  provider: string;
  label: string;
  /** last 4 characters only — the secret itself never leaves the server */
  tail: string;
  enabled: boolean;
  uses: number;
  failures: number;
  cooldownUntil: string;
  createdAt: string;
};

export function toKeyPoolView(row: {
  id: string;
  provider?: string;
  label: string;
  key_ciphertext: string;
  enabled: boolean;
  uses: number;
  failures: number;
  cooldown_until: string;
  created_at: string;
}): KeyPoolView {
  const cipher = row.key_ciphertext || "";
  let tail = "••••";
  const sep = cipher.lastIndexOf(":");
  const encoded = sep >= 0 ? cipher.slice(sep + 1) : cipher;
  if (encoded.length >= 8) tail = encoded.slice(-4);
  return {
    id: row.id,
    provider: row.provider ?? "",
    label: row.label,
    tail,
    enabled: row.enabled,
    uses: row.uses,
    failures: row.failures,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
  };
}
