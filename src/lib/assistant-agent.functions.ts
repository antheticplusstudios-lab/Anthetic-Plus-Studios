/**
 * Server entry points for the unified assistant (text + voice) on this app.
 * First-party pages always use the AntheticPlus site context; the browser
 * cannot choose another site here.
 */
import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confirmAction, getPublicConfig, runAssistant } from "@/assistant/assistant.service.server";
import { firstPartySite } from "@/assistant/sites/site-context.server";
import {
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_LENGTH,
  type AssistantPublicConfig,
  type AssistantResponse,
} from "@/assistant/assistant.types";

const askSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(MAX_HISTORY_TURNS * 2)
    .default([]),
  language: z.string().trim().max(20).optional(),
  languageConfidence: z.number().min(0).max(1).optional(),
});

function internal(requestId: string, e: unknown): AssistantResponse {
  if (e instanceof Response) throw e;
  console.error(`[assistant ${requestId}] unhandled`, e);
  return {
    ok: false,
    error: { code: "internal", message: "Something went wrong on our side. Please try again." },
    requestId,
  };
}

export const getAssistantConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<AssistantPublicConfig> => {
    try {
      return await getPublicConfig(await firstPartySite());
    } catch (e) {
      console.error("assistant config failed", e);
      return { enabled: false, voiceEnabled: false, welcomeMessage: "" };
    }
  },
);

export const askAssistantGuest = createServerFn({ method: "POST" })
  .validator((input: unknown) => askSchema.parse(input))
  .handler(async ({ data }): Promise<AssistantResponse> => {
    const requestId = randomUUID();
    try {
      return await runAssistant({
        auth: null,
        history: data.history,
        message: data.message,
        requestId,
        site: await firstPartySite(),
        providerKeyLabel: "Homepage Voice Agent",
        ...(data.language !== undefined ? { language: data.language } : {}),
        ...(data.languageConfidence !== undefined
          ? { languageConfidence: data.languageConfidence }
          : {}),
      });
    } catch (e) {
      return internal(requestId, e);
    }
  });

export const askAssistantUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => askSchema.parse(input))
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    const requestId = randomUUID();
    try {
      return await runAssistant({
        auth: context,
        history: data.history,
        message: data.message,
        requestId,
        site: await firstPartySite(),
        providerKeyLabel: "Homepage Voice Agent",
        ...(data.language !== undefined ? { language: data.language } : {}),
        ...(data.languageConfidence !== undefined
          ? { languageConfidence: data.languageConfidence }
          : {}),
      });
    } catch (e) {
      return internal(requestId, e);
    }
  });

export const confirmAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ token: z.string().min(10).max(20000) }).parse(input))
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    const requestId = randomUUID();
    try {
      return await confirmAction({
        auth: context,
        token: data.token,
        requestId,
        site: await firstPartySite(),
      });
    } catch (e) {
      return internal(requestId, e);
    }
  });
