/** Admin RPCs for per-automation integration key pools (Inworld / Twilio / Resend / LLM). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { classifyStatus } from "@/lib/key-pool";
import { SCOPE_GROUPS, toKeyPoolView } from "./integration-keys";
import { decryptSecret, encryptSecret } from "@/server/security/envelope.server";

const SCOPES = SCOPE_GROUPS.map((g) => g.scope) as [string, ...string[]];

function audit(
  ctx: { userId: string },
  scope: string,
  action: string,
  meta: Record<string, unknown>,
) {
  return auditMutation(ctx, {
    action: `integration_key.${action}`,
    targetType: "automation_key_pools",
    targetId: scope,
    metadata: { scope, ...meta },
  }).catch((e) => console.error("integration key audit failed", e));
}

async function db() {
  const { getDb } = await import("@/server/db/clients.server");
  return getDb("db2");
}

async function getDb2() {
  try {
    return await db();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Missing required server environment")) {
      throw new Error(
        "Databases are not connected yet. Add the 4 database keys in platform settings first.",
      );
    }
    throw new Error(msg);
  }
}

export const adminListIntegrationKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    try {
      const client = await db();
      const { data, error } = await client
        .from("automation_key_pools")
        .select(
          "id,scope,provider,label,key_ciphertext,enabled,uses,failures,cooldown_until,created_at",
        )
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const byScope: Record<string, ReturnType<typeof toKeyPoolView>[]> = {};
      for (const g of SCOPE_GROUPS) byScope[g.scope] = [];
      for (const row of data ?? []) {
        (byScope[row.scope] ??= []).push(toKeyPoolView(row));
      }
      return { notConfigured: false as const, byScope };
    } catch (e) {
      return { notConfigured: true as const, byScope: {}, message: (e as Error).message };
    }
  });

export const adminAddIntegrationKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        scope: z.enum(SCOPES),
        provider: z.enum(["llm", "inworld", "resend", "twilio"]),
        label: z.string().trim().min(1).max(80),
        secret: z.string().trim().min(8).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const group = SCOPE_GROUPS.find((g) => g.scope === data.scope);
    const pool = group?.pools.find((p) => p.provider === data.provider);
    if (!pool) throw new Error("That key type does not belong to this automation");
    const client = await getDb2();
    const { count, error: countError } = await client
      .from("automation_key_pools")
      .select("id", { count: "exact", head: true })
      .eq("scope", data.scope)
      .eq("provider", data.provider);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= pool.maxKeys) {
      throw new Error(`${pool.label} for ${group!.title} is limited to ${pool.maxKeys} keys`);
    }
    const { data: row, error } = await client
      .from("automation_key_pools")
      .insert({
        scope: data.scope,
        provider: data.provider,
        label: data.label,
        key_ciphertext: encryptSecret(data.secret),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    audit(context, data.scope, "create", { provider: data.provider, keyId: row!.id });
    return { id: row!.id };
  });

export const adminToggleIntegrationKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const client = await db();
    const { error } = await client
      .from("automation_key_pools")
      .update({ enabled: data.enabled, cooldown_until: "epoch" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    audit(context, "key", "toggle", { keyId: data.id, enabled: data.enabled });
    return { ok: true };
  });

export const adminDeleteIntegrationKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const client = await db();
    const { error } = await client.from("automation_key_pools").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    audit(context, "key", "delete", { keyId: data.id });
    return { ok: true };
  });

/** Lightweight provider ping. Updates uses/failures and cooldown so rotation reacts immediately. */
export const adminTestIntegrationKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const client = await getDb2();
    const { data: row, error } = await client
      .from("automation_key_pools")
      .select(
        "id,provider,key_ciphertext,enabled,uses,failures,cooldown_until,created_at,label,scope",
      )
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Key not found");
    const secret = decryptSecret(row["key_ciphertext"]);
    const provider = row["provider"] as string;
    const uses = Number(row["uses"] ?? 0);
    const failures = Number(row["failures"] ?? 0);

    let status = 0;
    let message = "";
    try {
      if (provider === "resend") {
        const r = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${secret}` },
        });
        status = r.status;
      } else if (provider === "inworld") {
        const r = await fetch("https://api.inworld.ai/tts/v1/voices", {
          headers: { Authorization: `Basic ${secret}`, "Content-Type": "application/json" },
        });
        status = r.status;
      } else if (provider === "twilio") {
        const [sid, token] = secret.split(":");
        if (!sid || !token)
          return { ok: false as const, message: "Twilio keys must be Account SID : Auth Token" };
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
          headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
        });
        status = r.status;
      } else {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${secret}` },
        });
        status = r.status;
      }
    } catch (e) {
      message = (e as Error).message;
    }

    const kind = message && !status ? "transient" : classifyStatus(status);
    const nowIso = new Date().toISOString();
    const patch: { uses?: number; failures?: number; cooldown_until?: string } = {};
    if (kind === "ok") patch.uses = uses + 1;
    else patch.failures = failures + 1;
    if (kind === "limit") patch.cooldown_until = new Date(Date.now() + 60_000).toISOString();
    if (kind === "auth") patch.cooldown_until = new Date(Date.now() + 30 * 60_000).toISOString();
    const { error: updErr } = await client
      .from("automation_key_pools")
      .update(patch)
      .eq("id", row["id"]);
    if (updErr) throw new Error(updErr.message);
    audit(context, String(row["scope"]), "test", { keyId: row["id"], kind });
    if (kind === "ok") return { ok: true as const, message: "Key works" };
    return {
      ok: false as const,
      message:
        kind === "auth"
          ? "Key was rejected — check it is correct and active"
          : kind === "limit"
            ? "Key reached its limit — it will rest and rotation will skip it"
            : message || `Provider responded with ${status}`,
      checkedAt: nowIso,
    };
  });
