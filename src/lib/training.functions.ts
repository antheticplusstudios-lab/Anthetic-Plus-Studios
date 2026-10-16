import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";

export const adminListTrainingJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    try {
      const { db3Admin, db2Admin } = await import("@/server/db/clients.server");
      const [jobs, autos] = await Promise.all([
        db3Admin
          .from("training_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(60),
        db2Admin
          .from("client_automations")
          .select("id,client_id,automation_type,domain_url,is_active")
          .limit(200),
      ]);
      if (jobs.error) throw new Error(jobs.error.message);
      return { ok: true as const, jobs: jobs.data ?? [], automations: autos.data ?? [] };
    } catch (e) {
      return { ok: false as const, jobs: [], automations: [], message: (e as Error).message };
    }
  });

export const adminRunTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target: string }) =>
    z
      .object({
        target: z.string().regex(/^(site:(antheticplus|ny-partners)|automation:[0-9a-f-]{36})$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const t = await import("@/lib/training.server");
    const [kind, id] = data.target.split(":") as [string, string];
    return kind === "site"
      ? t.trainSite(id as "antheticplus" | "ny-partners")
      : t.trainAutomation(id);
  });
