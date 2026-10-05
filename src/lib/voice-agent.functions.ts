import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const VOICE_AGENT_LABEL = "Homepage Voice Agent";
const emailTypes = ["renewal", "verification", "order_confirmation", "automation_status", "account_summary", "account_update", "announcement"] as const;
export type VoiceEmailType = (typeof emailTypes)[number];
export type VoiceAgentSettings = {
  enabled: boolean; voiceEnabled: boolean; accountContextEnabled: boolean; emailActionsEnabled: boolean; requireEmailConfirmation: boolean; inactivitySeconds: number; model: string; temperature: number; maxTokens: number; welcomeMessage: string; systemPrompt: string; publicContext: string; announcement: string; emailFromName: string; emailFromAddress: string; emailReplyTo: string; emailProvider: "resend" | "none"; emailEnabled: boolean; emailTemplates: Record<VoiceEmailType, { subject: string; body: string }>; ttsProvider: "elevenlabs"; ttsModel: string; ttsVoiceId: string;
};

export const getPublicVoiceAgentConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicVoiceAgentConfigImpl } = await import("@/lib/voice-agent.server");
  return getPublicVoiceAgentConfigImpl();
});

export const getVoiceAgentSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { getVoiceAgentSettingsImpl } = await import("@/lib/voice-agent.server");
  return getVoiceAgentSettingsImpl(context);
});

const settingsInput = z.object({
  enabled: z.boolean(), voiceEnabled: z.boolean(), accountContextEnabled: z.boolean(), emailActionsEnabled: z.boolean(), requireEmailConfirmation: z.boolean(), inactivitySeconds: z.number().int().min(30).max(180), model: z.string().trim().min(1).max(160), temperature: z.number().min(0.05).max(1), maxTokens: z.number().int().min(300).max(2400), welcomeMessage: z.string().max(600), systemPrompt: z.string().max(12000), publicContext: z.string().max(48000), announcement: z.string().max(12000), emailFromName: z.string().max(120), emailFromAddress: z.string().trim().max(254), emailReplyTo: z.string().trim().max(254), emailProvider: z.enum(["resend", "none"]), emailEnabled: z.boolean(), emailTemplates: z.record(z.enum(emailTypes), z.object({ subject: z.string().max(180), body: z.string().max(6000) })), ttsProvider: z.literal("elevenlabs"), ttsModel: z.string().trim().min(1).max(80), ttsVoiceId: z.string().trim().max(120),
});

export const saveVoiceAgentSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => settingsInput.parse(input)).handler(async ({ data, context }) => {
  const { saveVoiceAgentSettingsImpl } = await import("@/lib/voice-agent.server");
  return saveVoiceAgentSettingsImpl(data as VoiceAgentSettings, context);
});

const groqInput = z.object({ keyValue: z.string().trim().min(10).max(500), model: z.string().trim().max(160).optional() });
export const saveVoiceAgentGroqKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => groqInput.parse(input)).handler(async ({ data, context }) => {
  const { saveVoiceAgentGroqKeyImpl } = await import("@/lib/voice-agent.server");
  return saveVoiceAgentGroqKeyImpl(data, context);
});

export const clearVoiceAgentGroqKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { clearVoiceAgentGroqKeyImpl } = await import("@/lib/voice-agent.server");
  return clearVoiceAgentGroqKeyImpl(context);
});

const ttsKeyInput = z.object({ keyValue: z.string().trim().min(10).max(500) });
export const saveVoiceAgentTtsKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => ttsKeyInput.parse(input)).handler(async ({ data, context }) => {
  const { saveVoiceAgentTtsKeyImpl } = await import("@/lib/voice-agent.server");
  return saveVoiceAgentTtsKeyImpl(data, context);
});

export const clearVoiceAgentTtsKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { clearVoiceAgentTtsKeyImpl } = await import("@/lib/voice-agent.server");
  return clearVoiceAgentTtsKeyImpl(context);
});

export const testVoiceAgentTts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => z.object({ text: z.string().trim().min(2).max(600) }).parse(input)).handler(async ({ data, context }) => {
  const { testVoiceAgentTtsImpl } = await import("@/lib/voice-agent.server");
  return testVoiceAgentTtsImpl(data, context);
});

const emailInput = z.object({ enabled: z.boolean(), provider: z.enum(["resend", "none"]), apiKey: z.string().trim().max(500).optional(), fromName: z.string().trim().max(120), fromEmail: z.string().trim().max(254), replyTo: z.string().trim().max(254) });
export const saveVoiceAgentEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => emailInput.parse(input)).handler(async ({ data, context }) => {
  const { saveVoiceAgentEmailImpl } = await import("@/lib/voice-agent.server");
  return saveVoiceAgentEmailImpl(data, context);
});

export const testVoiceAgentEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { testVoiceAgentEmailImpl } = await import("@/lib/voice-agent.server");
  return testVoiceAgentEmailImpl(context);
});

const testInput = z.object({ question: z.string().trim().min(2).max(600), includeAccountContext: z.boolean().default(false) });
export const testVoiceAgent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => testInput.parse(input)).handler(async ({ data, context }) => {
  const { testVoiceAgentImpl } = await import("@/lib/voice-agent.server");
  return testVoiceAgentImpl(data, context);
});

export const voiceEmailTypeSchema = z.enum(emailTypes);
