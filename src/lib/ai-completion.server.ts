/** Structured completion helper backed by the canonical DB3 LLM pool. */
import { routeChat, type ChatMsg } from "@/lib/llm-router.server";
import { db3Admin } from "@/server/db/clients.server";

export class AiNotConfiguredError extends Error {
  constructor(
    message = "No AI provider is configured. Add a key under Admin → AI Infrastructure → LLM Providers.",
  ) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export type CompletionRequest = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: { name: string; description: string };
  automationId?: string | null;
  clientId?: string | null;
};

export type CompletionResult = {
  text: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export async function complete(
  _admin: typeof db3Admin,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const system = req.json
    ? `${req.system}\n\nRespond with ONLY minified JSON matching this shape. Do not use markdown fences or commentary: ${req.json.description}`
    : req.system;

  const messages: ChatMsg[] = [
    { role: "system", content: system },
    { role: "user", content: req.user },
  ];

  const result = await routeChat(
    messages,
    {
      automationId: req.automationId ?? null,
      clientId: req.clientId ?? null,
      maxTokens: req.maxTokens ?? 1200,
      temperature: req.temperature ?? 0.4,
    },
    _admin,
  );

  if (!result)
    throw new AiNotConfiguredError("All configured AI providers are unavailable right now.");
  return {
    text: result.reply,
    provider: result.provider,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}
