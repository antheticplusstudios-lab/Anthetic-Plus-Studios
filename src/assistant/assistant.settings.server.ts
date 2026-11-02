/**
 * Reads the assistant's admin-managed configuration from the existing
 * DB1 `platform_settings` row (key "voice_agent"), which the Admin → AI Voice
 * Agent page already edits. No new storage is introduced.
 */
import { db1Admin } from "@/server/db/clients.server";

export type AssistantSettings = {
  enabled: boolean;
  voiceEnabled: boolean;
  accountContextEnabled: boolean;
  emailActionsEnabled: boolean;
  welcomeMessage: string;
  persona: string;
  publicContext: string;
  announcement: string;
  temperature: number;
  maxTokens: number;
};

const DEFAULT_WELCOME =
  "Hi! I'm the Autumic assistant. Ask me about AI Receptionist, Workflow Automation, AI Sales Agent, AI Chatbot or book a free consultation.";

const DEFAULT_PUBLIC_CONTEXT =
  "Autumic is an AI automation company serving Bangladesh and international markets. We build AI Receptionists, Workflow Automation, AI Sales Agents, AI Chatbots, WhatsApp AI automation, lead follow-up, appointment booking, email automation and custom workflows. We work with real estate, healthcare, ecommerce, education, hotels, finance and professional services. Packages are custom-scoped; public fixed pricing is not available. The primary next step is a free consultation through /contact. Contact: info@autumic.com, +880 1915-349394, Baridhara, Dhaka-1212, Bangladesh. Security and tenant-isolation practices are described at /security.";

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function num(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export async function loadAssistantSettings(): Promise<AssistantSettings> {
  const { data, error } = await db1Admin
    .from("platform_settings")
    .select("value")
    .eq("key", "voice_agent")
    .maybeSingle();
  if (error) throw new Error(`settings: ${error.message}`);
  const v = rec(data?.value);
  return {
    enabled: v["enabled"] !== false,
    voiceEnabled: v["voiceEnabled"] !== false,
    accountContextEnabled: v["accountContextEnabled"] !== false,
    emailActionsEnabled: v["emailActionsEnabled"] !== false,
    welcomeMessage: String(v["welcomeMessage"] ?? DEFAULT_WELCOME).replace(/AntheticPlus/gi, "Autumic").replace(/antheticplusstudios@gmail.com/gi, "info@autumic.com")
      .replace(/AI Voice & SMS Receptionist/gi, "AI Receptionist")
      .replace(/AI Lead Capture & Smart Qualifier/gi, "AI Sales Agent")
      .replace(/AI Knowledge Base Support Agent/gi, "AI Customer Support Agent")
      .replace(/AI Social DM & Messaging Assistant/gi, "AI Chatbot").slice(0, 600) || DEFAULT_WELCOME,
    persona: String(v["systemPrompt"] ?? "").replace(/AntheticPlus/gi, "Autumic").replace(/antheticplusstudios@gmail.com/gi, "info@autumic.com").slice(0, 8000),
    publicContext: String(v["publicContext"] ?? DEFAULT_PUBLIC_CONTEXT).replace(/AntheticPlus/gi, "Autumic").replace(/antheticplusstudios@gmail.com/gi, "info@autumic.com")
      .replace(/Autumic Studios builds focused AI workforce systems for growing businesses\./gi, "Autumic is an AI automation company serving Bangladesh and international markets.")
      .replace(/Visitors can explore automation products, create an account and order an automation; payment is manually verified\./gi, "Packages are custom-scoped; public fixed pricing is not available. Visitors can book a free consultation at /contact.")
      .slice(0, 24000),
    announcement: String(v["announcement"] ?? "").slice(0, 4000),
    temperature: num(v["temperature"], 0.05, 1, 0.2),
    maxTokens: Math.round(num(v["maxTokens"], 300, 2400, 1200)),
  };
}
