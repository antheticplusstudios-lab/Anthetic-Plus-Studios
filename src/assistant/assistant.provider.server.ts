/**
 * AI provider abstraction for the assistant. The default implementation uses
 * the project's canonical LLM router (DB3 llm_api_keys pool with failover and
 * llm_requests logging). Swap providers here without touching UI or tools.
 */
import { routeChat, type ChatMsg } from "@/lib/llm-router.server";

export type ProviderMessage = ChatMsg;

export type ProviderCompletion = { text: string; provider: string; model: string };

export interface AssistantModelProvider {
  complete(
    messages: ProviderMessage[],
    options: {
      clientId: string | null;
      maxTokens: number;
      temperature: number;
      json: boolean;
      keyLabel?: string;
    },
  ): Promise<ProviderCompletion | null>;
}

export const routerProvider: AssistantModelProvider = {
  async complete(messages, options) {
    const routeOptions = {
      clientId: options.clientId,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      jsonMode: options.json,
    };
    const preferred = options.keyLabel
      ? await routeChat(messages, { ...routeOptions, keyLabel: options.keyLabel })
      : await routeChat(messages, routeOptions);
    const result = preferred ?? (options.keyLabel ? await routeChat(messages, routeOptions) : null);
    if (!result) return null;
    return { text: result.reply, provider: result.provider, model: result.model };
  },
};

export function getAssistantProvider(): AssistantModelProvider {
  return routerProvider;
}
