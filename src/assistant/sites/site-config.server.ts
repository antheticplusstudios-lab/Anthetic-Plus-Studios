/**
 * Per-site Web Assistant configuration, stored in the existing DB1
 * `platform_settings` table under one key per site
 * (`web_assistant_site:<siteId>`). No schema change is needed and each site's
 * row is read/written in isolation.
 */
import { db1Admin } from "@/server/db/clients.server";
import { SITES, SITE_TOOL_CATALOG, type SiteId } from "./site-registry";
import type {
  KnowledgeItem,
  KnowledgeSource,
  SiteConfig,
  SitePublicConfig,
} from "./site-config.types";

const keyFor = (id: SiteId) => `web_assistant_site:${id}`;

const DEFAULTS: Record<SiteId, SiteConfig> = {
  antheticplus: {
    enabled: true,
    voiceEnabled: true,
    displayName: "AntheticPlus Assistant",
    persona: "A friendly, precise product guide for AntheticPlus Studios.",
    tone: "Warm, concise, confident. Plain language.",
    welcomeMessage:
      "Hi! I'm the AntheticPlus assistant. Ask me about our automations and pricing, or sign in and I can help with your account.",
    instructions: "",
    businessInfo:
      "AntheticPlus Studios builds focused AI workforce systems for growing businesses. Visitors can explore automation products, create an account and order an automation; payment is manually verified. Security, tenant-isolation and audit practices are described at /security.",
    services: "",
    products: "",
    faqs: "",
    terminology: "",
    policies: "",
    contact: "General support: antheticplusstudios@gmail.com",
    hours: "",
    branding: { primary: "#7c5cff", accent: "#22d3ee", position: "right" },
    voice: { lang: "en-US", rate: 1, pitch: 1 },
    allowedTools: SITE_TOOL_CATALOG.map((t) => t.name),
    emailEnabled: true,
    limits: { maxMessageChars: 1200, maxTurnsPerConversation: 40 },
    extraDomains: [],
    analyticsEnabled: true,
    discovery: { enabled: false, refreshHours: 168 },
    knowledge: [],
    sources: [],
  },
  autumic: {
    enabled: true,
    voiceEnabled: true,
    displayName: "Autumic Assistant",
    persona: "The website assistant for Autumic, an AI automation company in Bangladesh.",
    tone: "Professional, practical, helpful. Problem-solving first.",
    welcomeMessage:
      "Hi! I'm the Autumic assistant. Ask me how AI automation could help your business.",
    instructions:
      "Encourage visitors who want specifics to book a free consultation. Never quote prices that are not in the knowledge.",
    businessInfo:
      "Autumic provides AI automation in Bangladesh (based in Dhaka), building AI receptionists and AI employees that answer customers, generate sales, and automate operations 24/7. Approach: problem-solving first, technology second.",
    services:
      "AI Receptionist: 24/7 front desk that answers common questions, captures leads, shares information and supports appointment booking.\nAI Sales Agent: responds to prospects, qualifies intent, answers sales questions, follows up.\nAI Chatbot: business-trained website assistant for FAQs, lead collection and customer help.\nWorkflow Automation: connects tools, moves information, updates systems.\nAlso: WhatsApp automation, lead recovery, CRM automation, customer support, appointment booking, email automation.",
    products: "",
    faqs: "",
    terminology: "",
    policies: "",
    contact: "Visitors can book a free consultation on autumic.com.",
    hours: "",
    branding: { primary: "#111827", accent: "#f97316", position: "right" },
    voice: { lang: "en-US", rate: 1, pitch: 1 },
    allowedTools: ["search_site_knowledge"],
    emailEnabled: false,
    limits: { maxMessageChars: 1000, maxTurnsPerConversation: 30 },
    extraDomains: [],
    analyticsEnabled: true,
    discovery: { enabled: true, refreshHours: 168 },
    knowledge: [],
    sources: [
      {
        id: "autumic-home",
        url: "https://autumic.com/",
        active: true,
        status: "never_scanned",
        error: null,
        lastScanAt: null,
        lastSuccessAt: null,
        lastChangeAt: null,
        contentHash: null,
        itemCount: 0,
      },
    ],
  },
};

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, fb: string, max = 8000) => (typeof v === "string" ? v.slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const num = (v: unknown, min: number, max: number, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};
const color = (v: unknown, fb: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fb;

/** Normalizes stored JSON into a complete config. Unknown tools are dropped; first-party-only tools are stripped from non-first-party sites. */
export function normalizeConfig(id: SiteId, raw: unknown): SiteConfig {
  const d = DEFAULTS[id];
  const v = rec(raw);
  const b = rec(v.branding);
  const vo = rec(v.voice);
  const l = rec(v.limits);
  const di = rec(v.discovery);
  const known = new Set(
    SITE_TOOL_CATALOG.filter((t) => SITES[id].firstParty || !t.firstPartyOnly).map((t) => t.name),
  );
  const tools = Array.isArray(v.allowedTools)
    ? v.allowedTools.filter((t): t is string => typeof t === "string" && known.has(t))
    : d.allowedTools;
  return {
    enabled: bool(v.enabled, d.enabled),
    voiceEnabled: bool(v.voiceEnabled, d.voiceEnabled),
    displayName: str(v.displayName, d.displayName, 80) || d.displayName,
    persona: str(v.persona, d.persona, 2000),
    tone: str(v.tone, d.tone, 1000),
    welcomeMessage: str(v.welcomeMessage, d.welcomeMessage, 600) || d.welcomeMessage,
    instructions: str(v.instructions, d.instructions, 6000),
    businessInfo: str(v.businessInfo, d.businessInfo, 8000),
    services: str(v.services, d.services, 8000),
    products: str(v.products, d.products, 8000),
    faqs: str(v.faqs, d.faqs, 12000),
    terminology: str(v.terminology, d.terminology, 4000),
    policies: str(v.policies, d.policies, 8000),
    contact: str(v.contact, d.contact, 2000),
    hours: str(v.hours, d.hours, 1000),
    branding: {
      primary: color(b.primary, d.branding.primary),
      accent: color(b.accent, d.branding.accent),
      position: b.position === "left" ? "left" : "right",
    },
    voice: {
      lang: str(vo.lang, d.voice.lang, 12) || "en-US",
      rate: num(vo.rate, 0.5, 1.6, 1),
      pitch: num(vo.pitch, 0.5, 1.6, 1),
    },
    allowedTools: tools,
    emailEnabled: SITES[id].firstParty ? bool(v.emailEnabled, d.emailEnabled) : false,
    limits: {
      maxMessageChars: Math.round(num(l.maxMessageChars, 100, 1200, d.limits.maxMessageChars)),
      maxTurnsPerConversation: Math.round(
        num(l.maxTurnsPerConversation, 4, 200, d.limits.maxTurnsPerConversation),
      ),
    },
    extraDomains: Array.isArray(v.extraDomains)
      ? v.extraDomains
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10)
      : d.extraDomains,
    analyticsEnabled: bool(v.analyticsEnabled, d.analyticsEnabled),
    discovery: {
      enabled: bool(di.enabled, d.discovery.enabled),
      refreshHours: Math.round(num(di.refreshHours, 6, 720, d.discovery.refreshHours)),
    },
    knowledge: Array.isArray(v.knowledge)
      ? (v.knowledge as KnowledgeItem[]).slice(0, 400)
      : d.knowledge,
    sources: Array.isArray(v.sources) ? (v.sources as KnowledgeSource[]).slice(0, 50) : d.sources,
  };
}

export async function loadSiteConfig(id: SiteId): Promise<SiteConfig> {
  const { data, error } = await db1Admin
    .from("platform_settings")
    .select("value")
    .eq("key", keyFor(id))
    .maybeSingle();
  if (error) throw new Error(`site config: ${error.message}`);
  return normalizeConfig(id, data?.value);
}

export async function saveSiteConfig(id: SiteId, next: SiteConfig): Promise<SiteConfig> {
  const clean = normalizeConfig(id, next);
  const { error } = await db1Admin
    .from("platform_settings")
    .upsert(
      { key: keyFor(id), value: clean, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`site config save: ${error.message}`);
  return clean;
}

export function toPublicConfig(
  id: SiteId,
  c: SiteConfig,
  globalEnabled: boolean,
): SitePublicConfig {
  return {
    siteId: id,
    enabled: globalEnabled && c.enabled,
    voiceEnabled: c.voiceEnabled,
    displayName: c.displayName,
    welcomeMessage: c.welcomeMessage,
    branding: c.branding,
    voice: c.voice,
  };
}
