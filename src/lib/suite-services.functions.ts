import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import {
  automationBySlug,
  resolveServiceSwitches,
  SUITE_DEFAULTS_ID,
} from "@/lib/automation-suite";

async function db2() {
  const { getDb } = await import("@/server/db/clients.server");
  return getDb("db2");
}

export const adminGetSuiteServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const def = automationBySlug(data.slug);
    if (!def) throw new Error("Unknown automation");
    try {
      const { data: rows, error } = await (
        await db2()
      )
        .from("automation_service_toggles")
        .select("service_id,enabled")
        .eq("automation_id", SUITE_DEFAULTS_ID[def.scope]);
      if (error) throw new Error(error.message);
      return { ok: true as const, switches: resolveServiceSwitches(def, rows ?? []) };
    } catch (e) {
      return {
        ok: false as const,
        switches: resolveServiceSwitches(def, []),
        message: (e as Error).message,
      };
    }
  });

export const adminSetSuiteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string; serviceId: string; enabled: boolean }) =>
    z
      .object({ slug: z.string().max(60), serviceId: z.string().max(60), enabled: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const def = automationBySlug(data.slug);
    if (!def || !def.services.some((s) => s.id === data.serviceId))
      throw new Error("Unknown service");
    const { error } = await (await db2()).from("automation_service_toggles").upsert({
      automation_id: SUITE_DEFAULTS_ID[def.scope],
      service_id: data.serviceId,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
