import { createServerFn } from "@tanstack/react-start";
import { db2Admin } from "@/server/db/clients.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LivePlan = {
  slug: string;
  monthly_price: number;
  yearly_discount_pct: number;
  setup_fee: number;
  active: boolean;
  listed?: boolean;
};

export const getLivePricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<LivePlan[]> => {
    // Authenticated checkout only: public pages never receive private plan prices.
    try {
      const { data, error } = await db2Admin
        .from("pricing_plans")
        .select("slug,monthly_price,yearly_discount_pct,active,listed,metadata");
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        ...p,
        monthly_price: Number(p.monthly_price),
        yearly_discount_pct: Number(p.yearly_discount_pct),
        setup_fee: Number(
          (p.metadata as { setup_fee?: unknown } | null)?.setup_fee ?? p.monthly_price,
        ),
      }));
    } catch (err) {
      console.warn(
        "[pricing] live pricing unavailable; checkout requires an active database plan:",
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  });
