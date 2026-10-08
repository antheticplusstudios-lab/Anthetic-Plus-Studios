import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Inbound events for the four automations (SMS/voice provider, lead forms, support, social DMs).
// Caller must present Authorization: Bearer <CRON_SECRET>. Duplicate external_event_id is ignored (DB4 unique).
const Body = z.object({
  provider: z.string().min(1).max(60),
  eventId: z.string().min(1).max(200),
  automationId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});

export const Route = createFileRoute("/api/public/automations/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
        const { provider, eventId, automationId, payload } = parsed.data;
        const { db4Admin } = await import("@/server/db/clients.server");
        const { runtimeBlockReason, enqueueExecution, AUTOMATION_KINDS } =
          await import("@/lib/automation-engine.server");
        const isAutomationKind = (value: string): value is (typeof AUTOMATION_KINDS)[number] =>
          AUTOMATION_KINDS.some((candidate) => candidate === value);
        const { createHash } = await import("node:crypto");
        // automation_events.status CHECK (DB4 migration 2026-10-03): received | enqueued | ignored | failed.
        let eventId_: string;
        const inserted = await db4Admin
          .from("automation_events")
          .insert({
            provider,
            external_event_id: eventId,
            automation_id: automationId,
            payload_hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
            status: "received",
          })
          .select("id")
          .single();
        if (inserted.error) {
          if (inserted.error.code !== "23505")
            return Response.json({ ok: false, error: "event_store_failed" }, { status: 500 });
          // Duplicate delivery. Only skip it if it was already handed to the queue; an earlier attempt that
          // died between "received" and "enqueued" must be retried, otherwise the event is lost forever.
          const prior = await db4Admin
            .from("automation_events")
            .select("id,status,execution_id,automation_id")
            .eq("provider", provider)
            .eq("external_event_id", eventId)
            .eq("automation_id", automationId)
            .maybeSingle();
          if (prior.error || !prior.data)
            return Response.json({ ok: false, error: "event_store_failed" }, { status: 500 });
          if (prior.data.status === "enqueued" || prior.data.status === "ignored")
            return Response.json({
              ok: true,
              duplicate: true,
              executionId: prior.data.execution_id ?? null,
            });
          eventId_ = String(prior.data.id);
        } else {
          eventId_ = String(inserted.data.id);
        }
        const mark = async (
          status: "enqueued" | "ignored" | "failed",
          extra: Record<string, unknown> = {},
        ) => {
          const r = await db4Admin
            .from("automation_events")
            .update({ status, ...extra })
            .eq("id", eventId_);
          if (r.error) console.error("automation_events update failed", r.error.message);
        };
        try {
          const gate = await runtimeBlockReason(automationId);
          const kindValue = String(
            gate.automation?.automation_type ?? gate.automation?.product_type ?? "",
          );
          if (!gate.automation || !isAutomationKind(kindValue)) {
            await mark("ignored", { error: "unknown or out-of-scope automation" });
            return Response.json({ ok: false, error: "unknown_automation" }, { status: 404 });
          }
          const exec = await enqueueExecution({
            automationId,
            clientId: String(gate.automation.client_id),
            kind: kindValue,
            idempotencyKey: `${provider}:${eventId}`,
            input: payload,
            triggerType: "webhook",
          });
          await mark("enqueued", { execution_id: exec.id, error: null });
          return Response.json({ ok: true, executionId: exec.id, blocked: gate.reason });
        } catch (e) {
          console.error("automation webhook enqueue failed", e instanceof Error ? e.message : e);
          await mark("failed", { error: "enqueue_failed" });
          // 500 so the provider redelivers; the duplicate path above will re-attempt this event.
          return Response.json({ ok: false, error: "enqueue_failed" }, { status: 500 });
        }
      },
    },
  },
});
