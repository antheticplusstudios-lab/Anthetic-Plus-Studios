/**
 * The single assistant brain. Text and voice both call runAssistant /
 * confirmAction. Read-only tools run immediately; side-effecting tools return
 * a signed PendingAction and only execute in confirmAction after re-checking
 * authorization. Every side-effecting outcome is written to DB1 audit_logs.
 */
import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import { auditMutation } from "@/lib/platform-access.server";
import { db1Admin } from "@/server/db/clients.server";
import type {
  AssistantResponse,
  AssistantLanguage,
  ChatTurn,
  PendingAction,
  ToolOutcome,
} from "./assistant.types";
import { z } from "zod";
import { MAX_HISTORY_TURNS } from "./assistant.types";
import {
  checkAccess,
  type ErasedAssistantTool,
  type ToolContext,
} from "./assistant.registry.server";
import { ASSISTANT_TOOLS, findTool } from "./assistant.tools.server";
import { buildSystemPrompt } from "./assistant.prompts.server";
import { getAssistantProvider, type ProviderMessage } from "./assistant.provider.server";
import { loadAssistantSettings } from "./assistant.settings.server";
import { createActionToken, verifyActionToken } from "./assistant.actions.server";
import { recordWebsiteKnowledgeGap } from "./learning.server";
import type { ResolvedSite } from "./sites/site-context.server";
import { languageMetadataFrom, responseLanguageForReply } from "@/voice/language";

const MAX_STEPS = 6;

type Decision = { reply: string; tool: { name: string; input: unknown } | null };

const decisionSchema = z.object({
  reply: z.string().max(4000).default(""),
  tool: z
    .object({ name: z.string().min(1).max(120), input: z.record(z.string(), z.unknown()) })
    .nullable()
    .default(null),
});

function parseDecision(raw: string): Decision | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = decisionSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return null;
    return { reply: parsed.data.reply.trim(), tool: parsed.data.tool };
  } catch {
    return null;
  }
}

function languageInstruction(language: AssistantLanguage): string {
  const mixed = language.mixedLanguages.length
    ? ` Mixed language cues detected: ${language.mixedLanguages.join(", ")}.`
    : "";
  if (language.language === "bn")
    return `Reply naturally in Bangla. For Banglish input, prefer natural Bangla script in the answer so speech synthesis can pronounce it correctly; keep product names and unavoidable technical terms in English.${mixed}`;
  if (language.language === "hi")
    return `Reply naturally in Hindi, preferably in Devanagari unless the user explicitly asks for Latin transliteration.${mixed}`;
  if (language.language === "es") return `Reply naturally in Spanish.${mixed}`;
  if (language.language === "fr") return `Reply naturally in French.${mixed}`;
  if (language.language === "de") return `Reply naturally in German.${mixed}`;
  if (language.language === "ar") return `Reply naturally in Arabic.${mixed}`;
  return `Reply naturally in the user's detected language (${language.language}). Preserve natural code-switching where useful, but do not switch languages unnecessarily.${mixed}`;
}

async function completeDecision(
  provider: ReturnType<typeof getAssistantProvider>,
  messages: ProviderMessage[],
  ctx: { clientId: string | null; maxTokens: number; temperature: number },
) {
  const completion = await provider.complete(messages, { ...ctx, json: true });
  if (!completion) return null;
  return { completion, decision: parseDecision(completion.text) };
}

function visibleTools(ctx: ToolContext): ErasedAssistantTool[] {
  return ASSISTANT_TOOLS.filter((t) => {
    if (checkAccess(t, ctx) !== null) return false;
    if (t.access !== "public" && !ctx.settings.accountContextEnabled && !t.sideEffect) return false;
    return true;
  });
}

function fail(
  requestId: string,
  code: Extract<AssistantResponse, { ok: false }>["error"]["code"],
  message: string,
): AssistantResponse {
  return { ok: false, error: { code, message }, requestId };
}

export async function getPublicConfig(site: ResolvedSite) {
  const s = await loadAssistantSettings();
  return {
    enabled: s.enabled && site.config.enabled,
    voiceEnabled: s.voiceEnabled && site.config.voiceEnabled,
    welcomeMessage: site.config.welcomeMessage,
  };
}

export async function runAssistant(args: {
  auth: AuthContext | null;
  history: ChatTurn[];
  message: string;
  requestId: string;
  site: ResolvedSite;
  /** Optional DB3 LLM key label for a specific assistant surface. */
  providerKeyLabel?: string;
  language?: string | null;
  languageConfidence?: number;
}): Promise<AssistantResponse> {
  const { requestId, auth, site } = args;
  const settings = await loadAssistantSettings();
  if (!settings.enabled || !site.config.enabled)
    return fail(
      requestId,
      "offline",
      "The assistant is offline right now. Please try again later.",
    );
  if (args.message.length > site.config.limits.maxMessageChars)
    return fail(requestId, "invalid_input", "That message is a bit long. Could you shorten it?");
  if (args.history.length >= site.config.limits.maxTurnsPerConversation)
    return fail(
      requestId,
      "invalid_input",
      "This conversation has reached its limit. Please start a new one.",
    );

  const ctx: ToolContext = { requestId, auth, settings, site };
  const tools = visibleTools(ctx);
  const provider = getAssistantProvider();
  const detectedLanguage = languageMetadataFrom(
    args.message,
    args.language,
    args.languageConfidence ?? 0,
  );
  const messages: ProviderMessage[] = [
    { role: "system", content: buildSystemPrompt(ctx, tools) },
    ...args.history
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) })),
    { role: "system", content: languageInstruction(detectedLanguage) },
    { role: "user", content: args.message },
  ];
  const actions: ToolOutcome[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const result = await completeDecision(provider, messages, {
      clientId: auth?.tenant.clientId ?? null,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      ...(args.providerKeyLabel ? { keyLabel: args.providerKeyLabel } : {}),
    });
    if (!result)
      return fail(
        requestId,
        "ai_unavailable",
        "I'm having trouble thinking right now. Please try again in a moment.",
      );

    let decision = result.decision;
    if (!decision) {
      const repair = await completeDecision(
        provider,
        [
          ...messages,
          { role: "assistant", content: result.completion.text.slice(0, 5000) },
          {
            role: "user",
            content:
              'Your previous output was invalid. Return ONLY valid JSON matching exactly this shape: {"reply":"string","tool":null} or {"reply":"string","tool":{"name":"tool_name","input":{}}}. Do not use markdown.',
          },
        ],
        {
          clientId: auth?.tenant.clientId ?? null,
          maxTokens: settings.maxTokens,
          temperature: 0,
          ...(args.providerKeyLabel ? { keyLabel: args.providerKeyLabel } : {}),
        },
      );
      decision = repair?.decision ?? null;
    }
    if (!decision)
      return fail(
        requestId,
        "ai_unavailable",
        "I couldn't format that response safely. Please try again.",
      );
    if (!decision.tool) {
      const reply = decision.reply || "Sorry, I didn't catch that. Could you rephrase?";
      const uncertain =
        /\b(i (?:don't|do not) know|not sure|i can(?:not|'t) (?:verify|confirm)|i don't have (?:that )?information|i'm not certain|cannot verify)\b/i.test(
          reply,
        );
      if (uncertain && !auth) await recordWebsiteKnowledgeGap(site.id, args.message, reply);
      return {
        ok: true,
        reply,
        actions,
        pending: null,
        language: responseLanguageForReply(reply, detectedLanguage),
        requestId,
      };
    }

    messages.push({ role: "assistant", content: JSON.stringify(decision) });
    const feedback = (content: string) =>
      messages.push({ role: "user", content: `TOOL_RESULT ${decision.tool!.name}: ${content}` });

    const tool = findTool(decision.tool.name);
    if (!tool || !tools.includes(tool)) {
      const denial = tool ? checkAccess(tool, ctx) : null;
      if (tool && denial)
        actions.push({ tool: tool.name, label: tool.label, status: "denied", summary: denial });
      feedback(
        JSON.stringify({
          ok: false,
          message: denial ?? "That tool is not available. Answer without it.",
        }),
      );
      continue;
    }

    const parsed = tool.input.safeParse(decision.tool.input);
    if (!parsed.success) {
      feedback(
        JSON.stringify({
          ok: false,
          message: "Invalid input. Ask the user for the missing details.",
        }),
      );
      continue;
    }
    const policy = tool.authorize ? await tool.authorize(parsed.data, ctx) : null;
    if (policy) {
      feedback(JSON.stringify({ ok: false, message: policy }));
      continue;
    }

    if (tool.sideEffect) {
      if (!auth) return fail(requestId, "unauthenticated", "Please sign in to do that.");
      const preview = tool.preview?.(parsed.data, ctx) ?? { title: tool.label, fields: [] };
      const { token, payload } = createActionToken({
        uid: auth.userId,
        tool: tool.name,
        input: parsed.data,
        rid: requestId,
      });
      const pending: PendingAction = {
        token,
        tool: tool.name,
        title: preview.title,
        fields: preview.fields,
        expiresAt: new Date(payload.exp).toISOString(),
      };
      const reply = decision.reply || `${preview.title}. Do you want me to go ahead?`;
      return {
        ok: true,
        reply,
        actions,
        pending,
        language: responseLanguageForReply(reply, detectedLanguage),
        requestId,
      };
    }

    try {
      const result = await Promise.race([
        tool.execute(parsed.data, ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tool timeout")), 15_000),
        ),
      ]);
      if (result.ok) {
        actions.push({
          tool: tool.name,
          label: tool.label,
          status: "success",
          summary: result.summary,
        });
        feedback(JSON.stringify({ ok: true, data: result.data }).slice(0, 12000));
      } else {
        actions.push({
          tool: tool.name,
          label: tool.label,
          status: "failed",
          summary: result.message,
        });
        feedback(JSON.stringify({ ok: false, message: result.message }));
      }
    } catch (e) {
      console.error(`[assistant ${requestId}] tool ${tool.name} crashed`, e);
      actions.push({
        tool: tool.name,
        label: tool.label,
        status: "failed",
        summary: `${tool.label} is unavailable right now.`,
      });
      feedback(JSON.stringify({ ok: false, message: "Tool unavailable." }));
    }
  }
  const reply = "I couldn't finish that just now. Could you try asking another way?";
  return {
    ok: true,
    reply,
    actions,
    pending: null,
    language: responseLanguageForReply(reply, detectedLanguage),
    requestId,
  };
}

async function alreadyExecuted(actionId: string): Promise<boolean> {
  const { data, error } = await db1Admin
    .from("audit_logs")
    .select("id")
    .eq("metadata->>actionId", actionId)
    .limit(1);
  if (error) {
    console.error("assistant replay check failed", error.message);
    return true; // fail closed: never risk a duplicate side effect
  }
  return (data ?? []).length > 0;
}

export async function confirmAction(args: {
  auth: AuthContext;
  token: string;
  requestId: string;
  site: ResolvedSite;
}): Promise<AssistantResponse> {
  const { auth, requestId, site } = args;
  const verified = verifyActionToken(args.token);
  if (verified === "expired")
    return fail(requestId, "expired", "That request expired. Please ask me again.");
  if (verified === "invalid" || verified.uid !== auth.userId)
    return fail(requestId, "forbidden", "I couldn't verify that action. Please ask me again.");

  const settings = await loadAssistantSettings();
  if (!settings.enabled || !site.config.enabled)
    return fail(requestId, "offline", "The assistant is offline right now.");
  const ctx: ToolContext = { requestId, auth, settings, site };
  const tool = findTool(verified.tool);
  if (!tool || !tool.sideEffect)
    return fail(requestId, "forbidden", "That action isn't available.");

  const audit = (status: "success" | "failed" | "denied", extra: Record<string, unknown> = {}) =>
    auditMutation(auth, {
      action: `assistant.${tool.name}`,
      targetType: "assistant_action",
      targetId: verified.id,
      clientId: auth.tenant.clientId,
      metadata: {
        actionId: verified.id,
        requestId,
        proposedInRequest: verified.rid,
        status,
        role: auth.tenant.role,
        ...extra,
      },
    }).catch((e) => console.error(`[assistant ${requestId}] audit write failed`, e));

  const denial = checkAccess(tool, ctx);
  const parsed = tool.input.safeParse(verified.input);
  const policy =
    !denial && parsed.success && tool.authorize ? await tool.authorize(parsed.data, ctx) : null;
  if (denial || !parsed.success || policy) {
    const msg = denial ?? policy ?? "That request is no longer valid.";
    await audit("denied", { reason: msg });
    return {
      ok: true,
      reply: msg,
      actions: [{ tool: tool.name, label: tool.label, status: "denied", summary: msg }],
      pending: null,
      language: responseLanguageForReply(msg),
      requestId,
    };
  }
  if (await alreadyExecuted(verified.id))
    return fail(requestId, "invalid_input", "That action was already handled.");

  try {
    const result = await tool.execute(parsed.data, ctx);
    if (result.ok) {
      const safe =
        result.data && typeof result.data === "object"
          ? (result.data as Record<string, unknown>)
          : {};
      await audit("success", { to: safe.to, providerMessageId: safe.providerMessageId });
      return {
        ok: true,
        reply: result.summary,
        actions: [
          { tool: tool.name, label: tool.label, status: "success", summary: result.summary },
        ],
        pending: null,
        language: responseLanguageForReply(result.summary),
        requestId,
      };
    }
    await audit("failed", { code: result.code });
    return {
      ok: true,
      reply: result.message,
      actions: [{ tool: tool.name, label: tool.label, status: "failed", summary: result.message }],
      pending: null,
      language: responseLanguageForReply(result.message),
      requestId,
    };
  } catch (e) {
    console.error(`[assistant ${requestId}] confirm ${tool.name} crashed`, e);
    await audit("failed", { code: "exception" });
    return fail(
      requestId,
      "tool_failed",
      `${tool.label} didn't go through. Please try again shortly.`,
    );
  }
}
