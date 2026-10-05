import { z } from "zod";
import { db1Admin, db2Admin, db3Admin } from "@/server/db/clients.server";
import { defineTool } from "../assistant.registry.server";

export const platformOverviewTool = defineTool({
  name: "get_platform_overview",
  label: "Platform overview",
  description:
    "Admin only. Platform-wide counts: clients, automations by run state, recent orders by status and recent AI request failures.",
  inputDoc: "{}",
  access: "admin",
  sideEffect: false,
  input: z.object({}).passthrough(),
  async execute() {
    const [clients, automations, orders, aiFailures] = await Promise.all([
      db1Admin.from("profiles").select("id", { count: "exact", head: true }),
      db2Admin.from("client_automations").select("run_state").limit(1000),
      db2Admin.from("orders").select("status").order("created_at", { ascending: false }).limit(200),
      db3Admin.from("llm_requests").select("id", { count: "exact", head: true }).neq("status", "success"),
    ]);
    for (const r of [clients, automations, orders, aiFailures]) {
      if (r.error) {
        console.error("platform overview failed", r.error.message);
        return { ok: false, code: "failed", message: "I couldn't load the platform overview right now." };
      }
    }
    const tally = (rows: any[] | null, key: string) =>
      (rows ?? []).reduce<Record<string, number>>((acc, r) => {
        const k = String(r[key] ?? "unknown");
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    return {
      ok: true,
      summary: "Loaded the platform overview.",
      data: {
        clients: clients.count ?? 0,
        automationsByState: tally(automations.data, "run_state"),
        recentOrdersByStatus: tally(orders.data, "status"),
        aiFailuresTotal: aiFailures.count ?? 0,
      },
    };
  },
});
