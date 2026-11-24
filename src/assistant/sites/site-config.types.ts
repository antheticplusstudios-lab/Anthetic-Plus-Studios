/** Client-safe shapes for per-site Web Assistant configuration. */
import type { SiteId } from "./site-registry";

export type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  /** manual = admin-authored (higher authority); discovered = extracted from an approved source. */
  kind: "manual" | "discovered";
  category:
    | "business"
    | "service"
    | "product"
    | "faq"
    | "policy"
    | "contact"
    | "hours"
    | "pricing"
    | "other";
  status: "approved" | "needs_review" | "disabled";
  sourceId: string | null;
  updatedAt: string;
};

export type KnowledgeSource = {
  id: string;
  url: string;
  active: boolean;
  status: "never_scanned" | "ok" | "failed" | "scanning";
  error: string | null;
  lastScanAt: string | null;
  lastSuccessAt: string | null;
  lastChangeAt: string | null;
  contentHash: string | null;
  itemCount: number;
};

export type SiteConfig = {
  enabled: boolean;
  voiceEnabled: boolean;
  displayName: string;
  persona: string;
  tone: string;
  welcomeMessage: string;
  instructions: string;
  businessInfo: string;
  services: string;
  products: string;
  faqs: string;
  terminology: string;
  policies: string;
  contact: string;
  hours: string;
  branding: { primary: string; accent: string; position: "right" | "left" };
  voice: { lang: string; rate: number; pitch: number };
  allowedTools: string[];
  emailEnabled: boolean;
  limits: { maxMessageChars: number; maxTurnsPerConversation: number };
  extraDomains: string[];
  analyticsEnabled: boolean;
  discovery: { enabled: boolean; refreshHours: number };
  knowledge: KnowledgeItem[];
  sources: KnowledgeSource[];
};

export type SitePublicConfig = {
  siteId: SiteId;
  enabled: boolean;
  voiceEnabled: boolean;
  displayName: string;
  welcomeMessage: string;
  branding: SiteConfig["branding"];
  voice: SiteConfig["voice"];
};

export const STALE_AFTER_HOURS = 24 * 7;
