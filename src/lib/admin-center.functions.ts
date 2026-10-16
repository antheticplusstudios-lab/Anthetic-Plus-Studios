import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { jsonValueSchema } from "@/lib/json-schema";
import type { Json } from "@/integrations/supabase/types";

const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ days: z.number().int().min(7).max(180) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const [autos, conversations, orders, llm, escalations, leads, audits] = await Promise.all([
      db2Admin
        .from("client_automations")
        .select("id,client_id,run_state,is_active,expires_at,created_at")
        .gte("created_at", since),
      db4Admin.from("conversations").select("id,automation_id,created_at").gte("created_at", since),
      db2Admin.from("orders").select("status,total_amount,created_at").gte("created_at", since),
      db3Admin.from("llm_requests").select("status,created_at").gte("created_at", since),
      db4Admin.from("ticket_escalations").select("created_at").gte("created_at", since),
      db4Admin.from("leads").select("created_at").gte("created_at", since),
      db1Admin
        .from("audit_logs")
        .select("action,created_at,target_type,target_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    for (const r of [autos, conversations, orders, llm, escalations, leads, audits])
      if (r.error) throw new Error(r.error.message);
    const keys: string[] = Array.from({ length: data.days }, (_, i) =>
      dayKey(new Date(Date.now() - (data.days - 1 - i) * 86400000)),
    );
    type DailySeries = {
      day: string;
      conversations: number;
      approved: number;
      rejected: number;
      pending: number;
      failures: number;
      escalations: number;
    };
    const series = Object.fromEntries(
      keys.map((d) => [
        d,
        {
          day: d,
          conversations: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          failures: 0,
          escalations: 0,
        } satisfies DailySeries,
      ]),
    ) as Record<string, DailySeries>;
    const bump = (date: string, field: Exclude<keyof DailySeries, "day">) => {
      const row = series[dayKey(date)];
      if (row) row[field] += 1;
    };
    for (const x of conversations.data ?? []) bump(x.created_at, "conversations");
    for (const x of orders.data ?? [])
      bump(
        x.created_at,
        String(x.status) === "approved"
          ? "approved"
          : String(x.status) === "rejected"
            ? "rejected"
            : "pending",
      );
    for (const x of llm.data ?? []) if (x.status !== "success") bump(x.created_at, "failures");
    for (const x of escalations.data ?? []) bump(x.created_at, "escalations");
    const automations = autos.data ?? [];
    const activeClients = new Set(
      automations.filter((a) => a.run_state === "active" && a.is_active).map((a) => a.client_id),
    ).size;
    const soon = Date.now() + 7 * 86400000;
    const approvedOrders = (orders.data ?? []).filter((o) => o.status === "approved");
    return {
      series: keys.map((d) => series[d]),
      totals: {
        conversations: conversations.data?.length ?? 0,
        leads: leads.data?.length ?? 0,
        activeClients,
        automations: automations.length,
        killed: automations.filter(
          (a) =>
            ["paused", "stopped", "disabled", "suspended", "expired"].includes(a.run_state) ||
            !a.is_active,
        ).length,
        expiringSoon: automations.filter(
          (a) =>
            a.expires_at &&
            new Date(a.expires_at).getTime() < soon &&
            new Date(a.expires_at).getTime() >= Date.now(),
        ).length,
        approved: approvedOrders.length,
        rejected: (orders.data ?? []).filter((o) => o.status === "rejected").length,
        pending: (orders.data ?? []).filter(
          (o) => !["approved", "rejected", "canceled"].includes(o.status),
        ).length,
        revenue: approvedOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0),
        failures: (llm.data ?? []).filter((x) => x.status !== "success").length,
        escalations: escalations.data?.length ?? 0,
      },
      statusCounts: Object.fromEntries(
        automations.reduce((m, a) => {
          m.set(a.run_state, (m.get(a.run_state) ?? 0) + 1);
          return m;
        }, new Map<string, number>()),
      ),
      recentActivity: audits.data ?? [],
    };
  });

export const saveCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        slug: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9-]+$/),
        name: z.string().min(2).max(80),
        description: z.string().max(600),
        monthly_price: z.number().min(0).max(100000),
        setup_fee: z.number().min(0).max(100000),
        yearly_discount_pct: z.number().min(0).max(90),
        active: z.boolean(),
        listed: z.boolean(),
        isNew: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const existing = data.isNew
      ? null
      : (
          await db2Admin
            .from("pricing_plans")
            .select("metadata")
            .eq("slug", data.slug)
            .maybeSingle()
        ).data;
    const yearly_price = Number(
      (data.monthly_price * 12 * (1 - data.yearly_discount_pct / 100)).toFixed(2),
    );
    const row = {
      slug: data.slug,
      name: data.name,
      description: data.description,
      monthly_price: data.monthly_price,
      yearly_price,
      active: data.active,
      listed: data.listed,
      product_type: data.slug,
      metadata: {
        ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
        setup_fee: data.setup_fee,
      },
    };
    const result = data.isNew
      ? await db2Admin.from("pricing_plans").insert(row)
      : await db2Admin.from("pricing_plans").update(row).eq("slug", row.slug);
    if (result.error) throw new Error(result.error.message);
    await auditMutation(context, {
      action: data.isNew ? "catalog.created" : "catalog.updated",
      targetId: null,
      targetType: "pricing_plan",
      after: row,
    });
    return { ok: true };
  });

export const bulkKill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ slug: z.string().nullable(), killed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    let q = db2Admin.from("client_automations").select("id,client_id,automation_type");
    if (data.slug) q = q.eq("automation_type", data.slug);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const next = data.killed ? "paused" : "active";
    for (const a of rows ?? []) {
      const { error: e } = await db2Admin.rpc("set_automation_runtime_state", {
        p_automation_id: a.id,
        p_state: next,
        p_reason: data.killed ? "bulk emergency pause" : "bulk resume",
        p_idempotency_key: `admin-bulk-runtime:${a.id}:${next}:${Date.now()}`,
        p_actor_user_id: context.userId,
      });
      if (e) throw new Error(e.message);
    }
    await auditMutation(context, {
      action: data.killed ? "automations.bulk.paused" : "automations.bulk.resumed",
      targetId: null,
      targetType: "automation_type",
      after: { slug: data.slug, count: rows?.length ?? 0 },
    });
    return { ok: true, count: rows?.length ?? 0 };
  });

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        key: z.enum(["banner", "maintenance", "feature_flags"]),
        value: z.record(z.string(), jsonValueSchema),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (data.key === "feature_flags") {
      for (const [key, value] of Object.entries(data.value)) {
        const { error } = await db1Admin
          .from("feature_flags")
          .upsert({ key, is_enabled: Boolean(value) }, { onConflict: "key" });
        if (error) throw new Error(error.message);
      }
    } else {
      const { error } = await db1Admin
        .from("platform_settings")
        .upsert(
          { key: data.key, value: data.value, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw new Error(error.message);
    }
    await auditMutation(context, {
      action: "settings.updated",
      targetId: null,
      targetType: data.key,
      after: data.value,
    });
    return { ok: true };
  });
