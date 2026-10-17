/**
 * AI provider abstraction for the assistant. The default implementation uses
 * the project's canonical LLM router (DB3 llm_api_keys pool with failover and
 * llm_requests logging). Swap providers here without touching UI or tools.
 */
import { routeChat, routeChatStream, type ChatMsg } from "@/lib/llm-router.server";

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
      signal?: AbortSignal;
    },
  ): Promise<ProviderCompletion | null>;
  streamText?(
    messages: ProviderMessage[],
    options: {
      clientId: string | null;
      maxTokens: number;
      temperature: number;
      keyLabel?: string;
      signal?: AbortSignal;
    },
    onDelta: (delta: string) => void,
  ): Promise<ProviderCompletion | null>;
}

export const routerProvider: AssistantModelProvider = {
  async complete(messages, options) {
    const routeOptions = {
      clientId: options.clientId,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      jsonMode: options.json,
      ...(options.signal ? { signal: options.signal } : {}),
    };
    const preferred = options.keyLabel
      ? await routeChat(messages, { ...routeOptions, keyLabel: options.keyLabel })
      : await routeChat(messages, routeOptions);
    const result = preferred ?? (options.keyLabel ? await routeChat(messages, routeOptions) : null);
    if (!result) return null;
    return { text: result.reply, provider: result.provider, model: result.model };
  },
  async streamText(messages, options, onDelta) {
    const result = await routeChatStream(
      messages,
      {
        clientId: options.clientId,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        ...(options.keyLabel ? { keyLabel: options.keyLabel } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
      onDelta,
    );
    return result ? { text: result.reply, provider: result.provider, model: result.model } : null;
  },
};

export function getAssistantProvider(): AssistantModelProvider {
  return routerProvider;
}
