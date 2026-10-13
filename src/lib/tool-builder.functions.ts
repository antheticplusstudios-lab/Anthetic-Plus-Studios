/**
 * Client capability requests + admin approval lifecycle. Requests and activation state
 * live in DB1 platform_settings (`tool_requests:<id>`, `tool_activation:<id>`); automations
 * and integrations are read from DB2. Authorization is enforced in capability-service.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CapabilityDeps } from "@/lib/capability-service.server";
export type { ToolRequest } from "@/lib/capability-service.server";

async function realDeps(): Promise<CapabilityDeps> {
  const { randomUUID } = await import("crypto");
  const { db1Admin, db2Admin } = await import("@/server/db/clients.server");
  const { auditMutation } = await import("@/lib/platform-access.server");
  const { ENGINE_KIND_BY_SLUG, SLUG_BY_ENGINE_KIND } = await import("@/lib/automations");
  const { connectedNeeds } = await import("@/lib/capability-lifecycle");
  const readKey = async (key: string) => {
    const { data, error } = await db1Admin
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value ?? null;
  };
  const writeKey = async (key: string, value: unknown) => {
    const { error } = await db1Admin
      .from("platform_settings")
      .upsert(
        { key, value: value as never, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
  };
  return {
    async getAutomation(id) {
      const { data, error } = await db2Admin
        .from("client_automations")
        .select("id,client_id,automation_type,product_type,name")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const r = data as Record<string, unknown>;
      const t = String(r.automation_type ?? r.product_type ?? "");
      const kind =
        t in SLUG_BY_ENGINE_KIND ? t : ENGINE_KIND_BY_SLUG[t as keyof typeof ENGINE_KIND_BY_SLUG];
      if (!kind) return null;
      return {
        id: String(r.id),
        clientId: String(r.client_id),
        kind: kind as never,
        name: String(r.name ?? t),
      };
    },
    async listAutomationIdsWithRequests() {
      const { data, error } = await db1Admin
        .from("platform_settings")
        .select("key")
        .like("key", "tool_requests:%")
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => String(r.key).slice("tool_requests:".length));
    },
    readRequests: async (id) => {
      const v = await readKey(`tool_requests:${id}`);
      return Array.isArray(v) ? (v as never) : [];
    },
    writeRequests: (id, list) => writeKey(`tool_requests:${id}`, list),
    readActivation: async (id) => (await readKey(`tool_activation:${id}`)) as never,
    writeActivation: (id, s) => writeKey(`tool_activation:${id}`, s),
    async connected(id) {
      const [{ data: conns }, { data: auto }] = await Promise.all([
        db2Admin
          .from("integration_connections")
          .select("provider")
          .eq("automation_id", id)
          .eq("status", "connected"),
        db2Admin.from("client_automations").select("config").eq("id", id).maybeSingle(),
      ]);
      const cfg = (auto?.config ?? {}) as Record<string, unknown>;
      const settings = (cfg.settings ?? {}) as Record<string, unknown>;
      return connectedNeeds(
        (conns ?? []).map((c) => String(c.provider)),
        settings,
        { resend: !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL },
      );
    },
    audit: (ctx, action, automationId, meta) =>
      auditMutation(ctx, {
        action,
        targetType: "automation",
        targetId: automationId,
        after: meta as never,
      }).then(
        () => undefined,
        (e) => console.error("capability audit failed", e),
      ),
    now: () => new Date().toISOString(),
    uuid: () => randomUUID(),
  };
}

const svc = () => import("@/lib/capability-service.server");
const idSchema = z.object({ automationId: z.string().uuid() });

export const listMyToolRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) =>
    (await svc()).clientView(await realDeps(), context, data.automationId),
  );

export const proposeToolRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    idSchema.extend({ request: z.string().trim().min(8).max(800) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    const deps = await realDeps();
    const auto = await s.ensureClientOwns(deps, context, data.automationId);
    const { proposeWithAi } = await import("@/lib/tool-builder.server");
    const raw = await proposeWithAi(auto.kind, data.request, {
      automationId: auto.id,
      clientId: auto.clientId,
    });
    return s.clientSubmit(deps, context, auto.id, data.request, raw);
  });

export const adminListCapabilityRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await svc()).adminList(await realDeps(), context));

export const adminDecideToolRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    idSchema
      .extend({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await svc()).adminDecide(
      await realDeps(),
      context,
      data.automationId,
      data.requestId,
      data.decision,
      data.note,
    ),
  );

export const adminCapabilityAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .discriminatedUnion("op", [
        idSchema.extend({ op: z.literal("recheck") }),
        idSchema.extend({
          op: z.literal("revoke"),
          toolId: z.string().max(60),
          note: z.string().max(300).default(""),
        }),
        idSchema.extend({ op: z.literal("rollback"), version: z.number().int().min(1) }),
        idSchema.extend({ op: z.literal("test"), toolId: z.string().max(60) }),
      ])
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    const deps = await realDeps();
    if (data.op === "recheck") return s.adminRecheck(deps, context, data.automationId);
    if (data.op === "revoke")
      return s.adminRevoke(deps, context, data.automationId, data.toolId, data.note);
    if (data.op === "rollback")
      return s.adminRollback(deps, context, data.automationId, data.version);
    return s.adminTest(deps, context, data.automationId, data.toolId);
  });
