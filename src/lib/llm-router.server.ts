/** Canonical LLM router. Provider credentials and runtime state live in DB3 only. */
import { db3Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";
import { orderKeys, modelFor, type PoolKey, type ProviderPool } from "@/lib/provider-pool";

type Admin = typeof db3Admin;
type ApiKeyRow = {
  id: string;
  provider_key: string;
  key_ciphertext: string;
  model: string | null;
  cooldown_until: string | null;
  request_count: number;
  priority: number;
};
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type RouteResult = {
  reply: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
};
type Opts = {
  automationId?: string | null;
  clientId?: string | null;
  maxTokens?: number;
  temperature?: number;
  provider?: string;
  keyLabel?: string;
  model?: string;
  jsonMode?: boolean;
  /** Per-automation provider pool (from DB2 client_automations.config.provider_pool). */
  pool?: ProviderPool | null;
  signal?: AbortSignal;
};

const ENDPOINT: Record<string, { url: string; model: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-4o-mini" },
  openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  anthropic: { url: "https://api.anthropic.com/v1/messages", model: "claude-3-5-haiku-latest" },
};

async function decryptKey(row: Pick<ApiKeyRow, "key_ciphertext">): Promise<string | null> {
  try {
    return decryptSecret(row.key_ciphertext);
  } catch {
    return null;
  }
}

async function log(
  admin: Admin,
  row: import("@/server/db/server-db.types").DB3Database["public"]["Tables"]["llm_requests"]["Insert"],
) {
  await admin.from("llm_requests").insert(row);
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(25_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function requestProvider(
  provider: string,
  key: string,
  model: string,
  messages: ChatMsg[],
  o: Opts,
) {
  if (provider === "anthropic") {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const bodyMessages = messages.filter((m) => m.role !== "system");
    const res = await fetch(ENDPOINT[provider]!.url, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: o.maxTokens ?? 600,
        temperature: o.temperature ?? 0.4,
        system,
        messages: bodyMessages,
      }),
      signal: requestSignal(o.signal),
    });
    const j = await res.json().catch(() => ({}) as unknown);
    return {
      res,
      reply: String(j?.content?.[0]?.text ?? "").trim(),
      tin: Number(j?.usage?.input_tokens ?? 0),
      tout: Number(j?.usage?.output_tokens ?? 0),
    };
  }
  const res = await fetch(ENDPOINT[provider]!.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: o.maxTokens ?? 600,
      temperature: o.temperature ?? 0.4,
      ...(o.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const j = await res.json().catch(() => ({}) as unknown);
  return {
    res,
    reply: String(j?.choices?.[0]?.message?.content ?? "").trim(),
    tin: Number(j?.usage?.prompt_tokens ?? 0),
    tout: Number(j?.usage?.completion_tokens ?? 0),
  };
}

export async function routeChat(
  messages: ChatMsg[],
  o: Opts = {},
  admin: Admin = db3Admin,
): Promise<RouteResult | null> {
  let query = admin
    .from("llm_api_keys")
    .select(
      "id,provider_key,label,key_ciphertext,model,cooldown_until,request_count,error_count,priority,is_active",
    )
    .eq("is_active", true);
  if (o.provider) query = query.eq("provider_key", o.provider);
  if (o.keyLabel) query = query.eq("label", o.keyLabel);
  const { data } = await query.order("priority", { ascending: true });
  const now = Date.now();
  const keys = orderKeys(
    (data ?? []).filter(
      (k) => !k.cooldown_until || new Date(k.cooldown_until).getTime() < now,
    ) as unknown as (PoolKey & (typeof data extends (infer R)[] | null ? R : never))[],
    o.pool ?? null,
  );

  for (const k of keys) {
    const provider = String(k.provider_key);
    const ep = ENDPOINT[provider];
    if (!ep) continue;
    const secret = await decryptKey(k);
    if (!secret) continue;
    const model = String(
      o.model?.trim() || modelFor(o.pool ?? null, provider) || k.model || ep.model,
    );
    const t0 = Date.now();
    try {
      const result = await requestProvider(provider, secret, model, messages, o);
      const latency = Date.now() - t0;
      if (result.res.ok && result.reply) {
        try {
          await admin
            .from("llm_api_keys")
            .update({
              request_count: Number(k.request_count ?? 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq("id", k.id);
        } catch (e) {
          console.error("llm key usage update failed", e);
        }
        try {
          await log(admin, {
            client_id: o.clientId ?? null,
            automation_id: o.automationId ?? null,
            key_id: k.id,
            provider_key: provider,
            model,
            status: "success",
            http_status: result.res.status,
            latency_ms: latency,
            tokens_in: result.tin,
            tokens_out: result.tout,
          });
        } catch (e) {
          console.error("llm success log failed", e);
        }
        return {
          reply: result.reply,
          provider,
          model,
          tokensIn: result.tin,
          tokensOut: result.tout,
        };
      }
      const errText = JSON.stringify(result.res.ok ? {} : result.reply || {}).slice(0, 500);
      try {
        await log(admin, {
          client_id: o.clientId ?? null,
          automation_id: o.automationId ?? null,
          key_id: k.id,
          provider_key: provider,
          model,
          status: "error",
          http_status: result.res.status,
          latency_ms: latency,
          error: errText,
        });
      } catch (e) {
        console.error("llm error log failed", e);
      }
      try {
        await admin
          .from("llm_api_keys")
          .update({
            error_count: Number(k.error_count ?? 0) + 1,
            last_error: `${result.res.status} ${errText}`.slice(0, 500),
            cooldown_until: new Date(
              Date.now() + (result.res.status === 429 ? 60_000 : 300_000),
            ).toISOString(),
          })
          .eq("id", k.id);
      } catch (e) {
        console.error("llm key cooldown update failed", e);
      }
    } catch (e) {
      if (o.signal?.aborted) throw e;
      const latency = Date.now() - t0;
      const error = String(e).slice(0, 500);
      try {
        await log(admin, {
          client_id: o.clientId ?? null,
          automation_id: o.automationId ?? null,
          key_id: k.id,
          provider_key: provider,
          model,
          status: "error",
          http_status: 0,
          latency_ms: latency,
          error,
        });
      } catch (logError) {
        console.error("llm exception log failed", logError);
      }
      try {
        await admin
          .from("llm_api_keys")
          .update({
            error_count: Number(k.error_count ?? 0) + 1,
            last_error: error,
            cooldown_until: new Date(Date.now() + 300_000).toISOString(),
          })
          .eq("id", k.id);
      } catch (updateError) {
        console.error("llm exception cooldown update failed", updateError);
      }
    }
  }
  return null;
}


type StreamUsage = { text: string; tokensIn: number; tokensOut: number };

async function consumeProviderStream(
  response: Response,
  provider: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<StreamUsage> {
  if (!response.body) throw new Error("Provider returned no streaming body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let tokensIn = 0;
  let tokensOut = 0;

  const line = (raw: string) => {
    const value = raw.trim();
    if (!value.startsWith("data:")) return;
    const data = value.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (payload?.type === "error" || payload?.error) {
      throw new Error(String(payload?.error?.message ?? payload?.message ?? "Provider stream failed."));
    }
    const inputCount = Number(
      payload?.usage?.prompt_tokens ?? payload?.usage?.input_tokens ?? payload?.message?.usage?.input_tokens ?? 0,
    );
    const outputCount = Number(
      payload?.usage?.completion_tokens ?? payload?.usage?.output_tokens ?? payload?.message?.usage?.output_tokens ?? 0,
    );
    if (Number.isFinite(inputCount)) tokensIn = Math.max(tokensIn, inputCount);
    if (Number.isFinite(outputCount)) tokensOut = Math.max(tokensOut, outputCount);

    const delta =
      provider === "anthropic"
        ? (payload?.type === "content_block_delta" && payload?.delta?.type === "text_delta"
            ? payload.delta.text
            : "")
        : (payload?.choices?.[0]?.delta?.content ?? "");
    if (typeof delta === "string" && delta) {
      text += delta;
      onDelta(delta);
    } else if (Array.isArray(delta)) {
      for (const part of delta) {
        if (typeof part?.text === "string" && part.text) {
          text += part.text;
          onDelta(part.text);
        }
      }
    }
  };

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const current = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        line(current);
        newline = buffer.indexOf("\n");
      }
      if (next.done) break;
    }
    if (buffer.trim()) line(buffer.replace(/\r$/, ""));
    return { text, tokensIn, tokensOut };
  } finally {
    if (signal?.aborted) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * Streams a plain-text final response through the same encrypted DB3 key pool used by routeChat.
 * Provider failover is allowed only before visible output, so text from two models is never mixed.
 */
export async function routeChatStream(
  messages: ChatMsg[],
  o: Opts = {},
  onDelta: (delta: string) => void,
  admin: Admin = db3Admin,
): Promise<RouteResult | null> {
  let query = admin
    .from("llm_api_keys")
    .select("id,provider_key,label,key_ciphertext,model,cooldown_until,request_count,error_count,priority,is_active")
    .eq("is_active", true);
  if (o.provider) query = query.eq("provider_key", o.provider);
  if (o.keyLabel) query = query.eq("label", o.keyLabel);
  const { data } = await query.order("priority", { ascending: true });
  const now = Date.now();
  const keys = orderKeys(
    (data ?? []).filter((k) => !k.cooldown_until || new Date(k.cooldown_until).getTime() < now) as unknown as
      (PoolKey & (typeof data extends (infer R)[] | null ? R : never))[],
    o.pool ?? null,
  );
  let emitted = false;

  for (const keyRow of keys) {
    const provider = String(keyRow.provider_key);
    const endpoint = ENDPOINT[provider];
    if (!endpoint) continue;
    const secret = await decryptKey(keyRow);
    if (!secret) continue;
    const model = String(o.model?.trim() || modelFor(o.pool ?? null, provider) || keyRow.model || endpoint.model);
    const started = Date.now();
    let status = 0;
    try {
      const isAnthropic = provider === "anthropic";
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const bodyMessages = messages.filter((m) => m.role !== "system");
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: isAnthropic
          ? {
              "x-api-key": secret,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            }
          : {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
        body: JSON.stringify(
          isAnthropic
            ? {
                model,
                max_tokens: o.maxTokens ?? 1200,
                temperature: o.temperature ?? 0.2,
                system,
                messages: bodyMessages,
                stream: true,
              }
            : {
                model,
                messages,
                max_tokens: o.maxTokens ?? 1200,
                temperature: o.temperature ?? 0.2,
                stream: true,
              },
        ),
        signal: requestSignal(o.signal),
      });
      status = response.status;
      if (!response.ok) {
        const details = (await response.text().catch(() => "")).slice(0, 400);
        throw new Error(`Provider HTTP ${response.status}: ${details}`);
      }
      const streamed = await consumeProviderStream(response, provider, (delta) => {
        emitted = true;
        onDelta(delta);
      }, o.signal);
      if (!streamed.text.trim()) throw new Error("Provider returned an empty stream.");
      try {
        await admin.from("llm_api_keys").update({
          request_count: Number(keyRow.request_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        }).eq("id", keyRow.id);
      } catch (e) {
        console.error("llm streamed key usage update failed", e);
      }
      try {
        await log(admin, {
          client_id: o.clientId ?? null,
          automation_id: o.automationId ?? null,
          key_id: keyRow.id,
          provider_key: provider,
          model,
          status: "success",
          http_status: status || 200,
          latency_ms: Date.now() - started,
          tokens_in: streamed.tokensIn,
          tokens_out: streamed.tokensOut || Math.ceil(streamed.text.length / 4),
        });
      } catch (e) {
        console.error("llm streamed success log failed", e);
      }
      return {
        reply: streamed.text,
        provider,
        model,
        tokensIn: streamed.tokensIn,
        tokensOut: streamed.tokensOut || Math.ceil(streamed.text.length / 4),
      };
    } catch (error) {
      if (o.signal?.aborted) throw error;
      const detail = String(error).slice(0, 500);
      try {
        await log(admin, {
          client_id: o.clientId ?? null,
          automation_id: o.automationId ?? null,
          key_id: keyRow.id,
          provider_key: provider,
          model,
          status: "error",
          http_status: status,
          latency_ms: Date.now() - started,
          error: detail,
        });
      } catch (logError) {
        console.error("llm streamed error log failed", logError);
      }
      try {
        await admin.from("llm_api_keys").update({
          error_count: Number(keyRow.error_count ?? 0) + 1,
          last_error: detail,
          cooldown_until: new Date(Date.now() + (status === 429 ? 60_000 : 300_000)).toISOString(),
        }).eq("id", keyRow.id);
      } catch (updateError) {
        console.error("llm streamed cooldown update failed", updateError);
      }
      if (emitted) throw error;
    }
  }
  return null;
}
