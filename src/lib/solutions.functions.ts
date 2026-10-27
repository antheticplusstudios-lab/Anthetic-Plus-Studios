/**
 * Marketing "Solutions" cards on the Products page. The saved list lives in
 * DB1 platform_settings ("site_solutions"); the public reader falls back to
 * the built-in defaults when the database is unreachable, so the storefront
 * never breaks. Writes require an admin and are audit-logged.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { DEFAULT_SOLUTIONS, solutionsListSchema, type SiteSolution } from "@/lib/solutions";
import { isListedProduct } from "@/lib/storefront";

const SETTINGS_KEY = "site_solutions";

export const getSolutions = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteSolution[]> => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env["DB1_URL"] ?? process.env["VITE_DB1_URL"];
      const key = process.env["DB1_ANON_KEY"] ?? process.env["VITE_DB1_ANON_KEY"];
      if (!url || !key) return DEFAULT_SOLUTIONS;
      const publicDb = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
              headers.delete("Authorization");
            headers.set("apikey", key);
            return fetch(input, { ...init, headers });
          },
        },
      });
      const { data, error } = await publicDb
        .from("platform_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return DEFAULT_SOLUTIONS;
      return solutionsListSchema.parse(data.value);
    } catch (err) {
      console.warn(
        "[solutions] saved solutions unavailable, using defaults:",
        err instanceof Error ? err.message : err,
      );
    }
    return DEFAULT_SOLUTIONS;
  },
);

/** The editor must fail closed instead of disguising a failed read as defaults. */
export const getAdminSolutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteSolution[]> => {
    assertAdmin(context);
    const { db1Admin } = await import("@/server/db/clients.server");
    const { data, error } = await db1Admin
      .from("platform_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error) throw new Error("Saved solutions could not be loaded. Please retry.");
    return data ? solutionsListSchema.parse(data.value) : DEFAULT_SOLUTIONS;
  });

export const saveSolutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ solutions: solutionsListSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { db1Admin, db2Admin } = await import("@/server/db/clients.server");
    const { auditMutation } = await import("@/lib/platform-access.server");
    const clean = data.solutions;
    const { data: plans, error: plansError } = await db2Admin
      .from("pricing_plans")
      .select("slug,active,listed");
    if (plansError) throw new Error("Product availability could not be checked. Please retry.");
    if (clean.some((item) => !isListedProduct(item.slug, plans ?? [])))
      throw new Error("Each solution must link to a currently available product.");
    const { error } = await db1Admin
      .from("platform_settings")
      .upsert(
        { key: SETTINGS_KEY, value: clean, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "settings.updated",
      targetId: null,
      targetType: SETTINGS_KEY,
      after: { count: clean.length },
    });
    return { ok: true };
  });
