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
  "Hi! I'm the AntheticPlus assistant. Ask me about our automations and pricing, or sign in and I can help with your account.";

const DEFAULT_PUBLIC_CONTEXT =
  "AntheticPlus Studios builds focused AI workforce systems for growing businesses. Visitors can explore automation products, create an account and order an automation; payment is manually verified. Security, tenant-isolation and audit practices are described at /security. General support: antheticplusstudios@gmail.com.";

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
    enabled: v.enabled !== false,
    voiceEnabled: v.voiceEnabled !== false,
    accountContextEnabled: v.accountContextEnabled !== false,
    emailActionsEnabled: v.emailActionsEnabled !== false,
    welcomeMessage: String(v.welcomeMessage ?? DEFAULT_WELCOME).slice(0, 600) || DEFAULT_WELCOME,
    persona: String(v.systemPrompt ?? "").slice(0, 8000),
    publicContext: String(v.publicContext ?? DEFAULT_PUBLIC_CONTEXT).slice(0, 24000),
    announcement: String(v.announcement ?? "").slice(0, 4000),
    temperature: num(v.temperature, 0.05, 1, 0.2),
    maxTokens: Math.round(num(v.maxTokens, 300, 2400, 1200)),
  };
}
