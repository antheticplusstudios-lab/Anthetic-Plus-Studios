import { createServerFn } from "@tanstack/react-start";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";

export type StatusReport = {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number; domains: Record<string, { ok: boolean; latencyMs: number }> };
  api: { ok: boolean; latencyMs: number };
  inference: { ok: boolean };
};

async function ping(db: any, table: string) {
  const start = Date.now();
  const { error } = await db.from(table).select("*", { head: true, count: "exact" }).limit(1);
  return { ok: !error, latencyMs: Date.now() - start };
}

export const getSystemStatus = createServerFn({ method: "GET" }).handler(async (): Promise<StatusReport> => {
  const started = Date.now();
  const [d1, d2, d3, d4] = await Promise.all([
    ping(db1Admin, "organizations"),
    ping(db2Admin, "client_automations"),
    ping(db3Admin, "ai_configs"),
    ping(db4Admin, "conversations"),
  ]);
  const { data: keys } = await db3Admin.from("llm_providers").select("provider_key,status").eq("status", "active").limit(20);
  return {
    checkedAt: new Date().toISOString(),
    database: { ok: [d1,d2,d3,d4].every((x) => x.ok), latencyMs: Math.max(d1.latencyMs,d2.latencyMs,d3.latencyMs,d4.latencyMs), domains: { db1: d1, db2: d2, db3: d3, db4: d4 } },
    api: { ok: true, latencyMs: Date.now() - started },
    inference: { ok: (keys ?? []).length > 0 },
  };
});
