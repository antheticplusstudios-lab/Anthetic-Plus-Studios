import { createServerFn } from "@tanstack/react-start";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";

export type StatusReport = {
  checkedAt: string;
  database: {
    ok: boolean;
    latencyMs: number;
    domains: Record<string, { ok: boolean; latencyMs: number }>;
  };
  api: { ok: boolean; latencyMs: number };
  inference: { ok: boolean };
};

async function ping(query: () => PromiseLike<{ error: { message: string } | null }>) {
  const start = Date.now();
  const { error } = await query();
  return { ok: !error, latencyMs: Date.now() - start };
}

export const getSystemStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<StatusReport> => {
    const started = Date.now();
    const [d1, d2, d3, d4] = await Promise.all([
      ping(() =>
        db1Admin.from("organizations").select("id", { head: true, count: "exact" }).limit(1),
      ),
      ping(() =>
        db2Admin.from("client_automations").select("id", { head: true, count: "exact" }).limit(1),
      ),
      ping(() =>
        db3Admin
          .from("ai_configs")
          .select("automation_id", { head: true, count: "exact" })
          .limit(1),
      ),
      ping(() =>
        db4Admin.from("conversations").select("id", { head: true, count: "exact" }).limit(1),
      ),
    ]);
    const { data: keys } = await db3Admin
      .from("llm_providers")
      .select("provider_key,status")
      .eq("status", "active")
      .limit(20);
    return {
      checkedAt: new Date().toISOString(),
      database: {
        ok: [d1, d2, d3, d4].every((x) => x.ok),
        latencyMs: Math.max(d1.latencyMs, d2.latencyMs, d3.latencyMs, d4.latencyMs),
        domains: { db1: d1, db2: d2, db3: d3, db4: d4 },
      },
      api: { ok: true, latencyMs: Date.now() - started },
      inference: { ok: (keys ?? []).length > 0 },
    };
  },
);
