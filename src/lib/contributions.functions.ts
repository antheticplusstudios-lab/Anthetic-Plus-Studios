import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { contributionsSchema, type Contributor } from "@/lib/contributions";

const KEY = "autumic_contributions";

export const getContributions = createServerFn({ method: "GET" }).handler(
  async (): Promise<Contributor[]> => {
    const { db1Admin } = await import("@/server/db/clients.server");
    const { data, error } = await db1Admin
      .from("platform_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    if (error) throw new Error("Contributions are temporarily unavailable.");
    return data
      ? contributionsSchema
          .parse(data.value)
          .filter((person) => person.published)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
  },
);

export const getAdminContributions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Contributor[]> => {
    assertAdmin(context);
    const { db1Admin } = await import("@/server/db/clients.server");
    const { data, error } = await db1Admin
      .from("platform_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    if (error) throw new Error("Saved contributors could not be loaded.");
    return data ? contributionsSchema.parse(data.value) : [];
  });

export const saveContributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contributors: contributionsSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const clean = contributionsSchema.parse(data.contributors);
    const ids = new Set<string>();
    for (const person of clean) {
      if (ids.has(person.id)) throw new Error("Contributor IDs must be unique.");
      ids.add(person.id);
    }
    const { db1Admin } = await import("@/server/db/clients.server");
    const { auditMutation } = await import("@/lib/platform-access.server");
    const { error } = await db1Admin
      .from("platform_settings")
      .upsert(
        { key: KEY, value: clean, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error("Contributions could not be saved.");
    try {
      await auditMutation(context, {
        action: "settings.updated",
        targetType: KEY,
        after: { count: clean.length },
      });
    } catch (auditError) {
      console.error("[contributions] audit log failed after save", auditError);
    }
    return { ok: true };
  });
