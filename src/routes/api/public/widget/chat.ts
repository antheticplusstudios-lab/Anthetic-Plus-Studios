import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { routeChat } from "@/lib/llm-router.server";
import { retrieveKnowledge } from "@/lib/rag.server";
import {
  usageIdempotencyKey,
  buildSystemPrompt,
  fail,
  json,
  originAllowed,
  preflight,
  resolveInstallation,
  widgetEnabledGlobally,
  runtimeState,
  withinRateLimit,
  adminClient,
  type RuntimeAdmin,
} from "@/lib/widget.server";

const Payload = z.object({
  token: z.string().min(32).max(128),
  message: z.string().trim().min(1).max(2000),
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{16,64}$/),
});

async function activeSubscription(runtime: RuntimeAdmin, clientId: string) {
  const { data } = await runtime.db2
    .from("subscriptions")
    .select("status,grace_period_end,current_period_end")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const status = String(data.status);
  if (["suspended", "canceled", "expired"].includes(status)) {
    const grace = data.grace_period_end ? new Date(String(data.grace_period_end)).getTime() : 0;
    if (!grace || grace <= Date.now()) return false;
  }
  const expired =
    !!data.current_period_end && new Date(String(data.current_period_end)).getTime() <= Date.now();
  const inGrace =
    !!data.grace_period_end && new Date(String(data.grace_period_end)).getTime() > Date.now();
  if (expired && !inGrace) return false;
  return true;
}

export const Route = createFileRoute("/api/public/widget/chat")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request.headers.get("origin")),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        let body: z.infer<typeof Payload>;
        try {
          body = Payload.parse(await request.json());
        } catch {
          return fail("Invalid request", 400, origin, "bad_request");
        }
        const runtime = adminClient();
        if (!(await widgetEnabledGlobally(runtime)))
          return fail("Assistant is offline", 503, origin, "offline");
        const inst = await resolveInstallation(runtime, body.token);
        if (!inst) return fail("Unknown installation", 404, origin, "invalid_token");
        if (!originAllowed(inst, origin, new URL(request.url).host))
          return fail("Domain not authorised", 403, origin, "domain");
        if (!(await activeSubscription(runtime, inst.client_id)))
          return fail("Assistant is not active", 403, origin, "inactive");
        if (!((await runtimeState(runtime, inst.id)) === "active"))
          return fail("This assistant is not available", 403, origin, "inactive");
        if (!(await withinRateLimit(runtime, inst.id)))
          return fail("Too many messages, try again shortly", 429, origin, "rate_limited");

        const { data: existing } = await runtime.db4
          .from("conversations")
          .select("id,status")
          .eq("automation_id", inst.id)
          .eq("visitor_session", body.sessionId)
          .maybeSingle();
        let conversationId = String(existing?.id ?? "");
        if (!conversationId) {
          const created = await runtime.db4
            .from("conversations")
            .insert({
              client_id: inst.client_id,
              automation_id: inst.id,
              channel: "web_chat",
              visitor_session: body.sessionId,
              origin: origin ?? "",
              status: "active",
            })
            .select("id")
            .single();
          if (created.error || !created.data)
            return fail("Could not start conversation", 500, origin);
          conversationId = String(created.data.id);
          await runtime.db4.rpc("enqueue_outbox", {
            p_event_type: "conversation.created",
            p_aggregate_type: "conversation",
            p_aggregate_id: conversationId,
            p_idempotency_key: `conversation.created:${conversationId}`,
            p_payload: {
              conversation_id: conversationId,
              client_id: inst.client_id,
              automation_id: inst.id,
              origin,
            },
          });
        }

        const userMessage = await runtime.db4
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "user",
            content: body.message,
            metadata: { origin },
          })
          .select("id")
          .single();
        if (userMessage.error || !userMessage.data)
          return fail("Could not record message", 500, origin);
        const userMessageId = String(userMessage.data.id);
        await runtime.db4.rpc("enqueue_outbox", {
          p_event_type: "message.created",
          p_aggregate_type: "message",
          p_aggregate_id: userMessageId,
          p_idempotency_key: `message.created:${userMessageId}`,
          p_payload: {
            message_id: userMessageId,
            conversation_id: conversationId,
            client_id: inst.client_id,
            automation_id: inst.id,
          },
        });

        const { data: hist } = await runtime.db4
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(12);
        const history = (
          (hist ?? []) as { role: "user" | "assistant"; content: string }[]
        ).reverse();
        let system = await buildSystemPrompt(runtime, inst);
        const retrieved = await retrieveKnowledge(
          inst.id,
          body.message,
          Number((inst.widget_config?.["retrievalTopK"] as number) ?? 8),
        );
        if (retrieved.length) {
          const facts = retrieved
            .map(
              (r) =>
                `- ${r.source_name} (${Number(r.similarity).toFixed(2)}): ${r.content.slice(0, 1800)}`,
            )
            .join("\n");
          system += `\n\nRETRIEVED KNOWLEDGE FOR THIS TURN:\n${facts}`;
        }
        const routed = await routeChat(
          [{ role: "system", content: system }, ...history],
          { automationId: inst.id, clientId: inst.client_id },
          runtime.db3,
        );
        const now = new Date().toISOString();
        await runtime.db2
          .from("client_automations")
          .update({ last_heartbeat_at: now })
          .eq("id", inst.id);
        if (!routed) {
          await runtime.db4
            .from("conversations")
            .update({ last_message_at: now })
            .eq("id", conversationId);
          return fail("The assistant is temporarily unavailable", 502, origin, "provider");
        }

        const assistantMessage = await runtime.db4
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: routed.reply,
            tokens_used: routed.tokensIn + routed.tokensOut,
            provider_key: routed.provider,
            model: routed.model,
          })
          .select("id")
          .single();
        if (assistantMessage.error || !assistantMessage.data)
          return fail("Could not record assistant response", 500, origin);
        await runtime.db4
          .from("conversations")
          .update({ last_message_at: now })
          .eq("id", conversationId);

        const usageResult = await runtime.db2.rpc("increment_usage_meter", {
          p_client_id: inst.client_id,
          p_automation_id: inst.id,
          p_billing_period: new Date().toISOString().slice(0, 7),
          p_metric_name: "tokens",
          p_quantity: routed.tokensIn + routed.tokensOut,
          p_unit: "tokens",
          p_idempotency_key: usageIdempotencyKey(inst.id, conversationId, userMessageId),
          p_metadata: {
            provider: routed.provider,
            model: routed.model,
            conversation_id: conversationId,
            message_id: userMessageId,
          },
        });
        if (usageResult.error) console.error("usage meter failed", usageResult.error);

        return json({ reply: routed.reply, conversationId }, 200, origin);
      },
    },
  },
});
