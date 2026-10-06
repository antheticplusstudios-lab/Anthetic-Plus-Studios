/** Canonical LLM router. Provider credentials and runtime state live in DB3 only. */
import { db3Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";

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
      signal: AbortSignal.timeout(25_000),
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
  const keys = (data ?? []).filter(
    (k) => !k.cooldown_until || new Date(k.cooldown_until).getTime() < now,
  );

  for (const k of keys) {
    const provider = String(k.provider_key);
    const ep = ENDPOINT[provider];
    if (!ep) continue;
    const secret = await decryptKey(k);
    if (!secret) continue;
    const model = String(o.model?.trim() || k.model || ep.model);
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
