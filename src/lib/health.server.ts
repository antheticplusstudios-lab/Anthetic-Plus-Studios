import type { RuntimeAdmin } from "@/lib/widget.server";

type Status = "ok" | "warn" | "fail" | "skip";
type Result = {
  check_type: string;
  status: Status;
  latency_ms?: number | undefined;
  error?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};
export type Overall = "HEALTHY" | "DEGRADED" | "WARNING" | "ERROR" | "OFFLINE" | "SUSPENDED";
const CRITICAL = new Set(["database", "api_runtime", "ai_provider"]);

async function timed<T>(fn: () => PromiseLike<T>) {
  const t0 = Date.now();
  const v = await fn();
  return { v, ms: Date.now() - t0 };
}

export async function probeAutomation(runtime: RuntimeAdmin, id: string, appOrigin: string) {
  const results: Result[] = [];
  const db = await timed(() =>
    runtime.db2
      .from("client_automations")
      .select(
        "id,client_id,automation_type,domain_url,run_state,is_active,expires_at,requires_reinstallation,last_heartbeat_at",
      )
      .eq("id", id)
      .maybeSingle(),
  );
  const a = db.v.data;
  results.push({
    check_type: "database",
    status: db.v.error ? "fail" : "ok",
    latency_ms: db.ms,
    error: db.v.error?.message,
  });
  if (!a) return { overall: "ERROR" as Overall, results };
  const runtimeResult = await runtime.db2.rpc("automation_local_runtime_state", {
    p_automation_id: id,
  });
  const runtimeState = String(
    (runtimeResult.data as Record<string, unknown> | null)?.state ?? "missing",
  );
  const since24 = new Date(Date.now() - 86_400_000).toISOString();

  try {
    const r = await timed(() =>
      fetch(
        `${appOrigin}/api/public/widget/config?token=${encodeURIComponent(process.env[`TEST_WIDGET_TOKEN_${id}`] ?? "")}`,
        { headers: { Origin: appOrigin }, signal: AbortSignal.timeout(8000) },
      ),
    );
    const ok = r.v.status === 200 || (runtimeState !== "active" && r.v.status === 403);
    results.push({
      check_type: "api_runtime",
      status: ok ? "ok" : "fail",
      latency_ms: r.ms,
      error: ok ? undefined : `HTTP ${r.v.status}`,
      metadata: { http: r.v.status },
    });
  } catch (e) {
    results.push({ check_type: "api_runtime", status: "fail", error: String(e).slice(0, 200) });
  }

  const { data: reqs } = await runtime.db3
    .from("llm_requests")
    .select("status,provider_key,latency_ms,error,created_at")
    .eq("automation_id", id)
    .gte("created_at", since24)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = reqs ?? [];
  if (rows.length) {
    const errs = rows.filter((x) => x.status !== "success").length;
    const lastOk = rows.find((x) => x.status === "success");
    results.push({
      check_type: "ai_provider",
      status: !lastOk ? "fail" : errs / rows.length > 0.5 ? "warn" : "ok",
      latency_ms: lastOk?.latency_ms ?? undefined,
      error: errs ? `${errs}/${rows.length} provider attempts failed in 24h` : undefined,
      metadata: { attempts: rows.length, errors: errs, last_provider: lastOk?.provider_key },
    });
  } else {
    results.push({
      check_type: "ai_provider",
      status: "warn",
      error: "No AI traffic in 24h to verify providers",
    });
  }

  const { data: installation } = await runtime.db2
    .from("automation_installations")
    .select("installed_at,last_seen_at,installation_status")
    .eq("automation_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const seenMs = a.last_heartbeat_at ? Date.now() - new Date(a.last_heartbeat_at).getTime() : null;
  results.push({
    check_type: "installation",
    status: a.requires_reinstallation ? "warn" : installation?.installed_at ? "ok" : "warn",
    error: a.requires_reinstallation
      ? "Reinstallation required"
      : installation?.installed_at
        ? undefined
        : "Never verified from client domain",
    metadata: installation ?? {},
  });
  results.push({
    check_type: "widget",
    status: seenMs === null ? "warn" : seenMs > 7 * 86_400_000 ? "warn" : "ok",
    error:
      seenMs === null
        ? "Widget has never loaded"
        : seenMs > 7 * 86_400_000
          ? "No widget activity in 7 days"
          : undefined,
    metadata: { last_heartbeat_at: a.last_heartbeat_at },
  });

  try {
    if (!a.domain_url) throw new Error("No domain configured");
    const url = /^https?:\/\//.test(a.domain_url) ? a.domain_url : `https://${a.domain_url}`;
    const r = await timed(() =>
      fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) }),
    );
    results.push({
      check_type: "domain",
      status: r.v.status < 500 ? "ok" : "fail",
      latency_ms: r.ms,
      error: r.v.status < 500 ? undefined : `HTTP ${r.v.status}`,
      metadata: { http: r.v.status },
    });
  } catch (e) {
    results.push({
      check_type: "domain",
      status: "warn",
      error: `Unavailable: ${String(e).slice(0, 160)}`,
    });
  }

  const { count: kb } = await runtime.db3
    .from("kb_documents")
    .select("id", { count: "exact", head: true })
    .eq("automation_id", id)
    .eq("status", "completed");
  const { data: crawl } = await runtime.db3
    .from("crawl_jobs")
    .select("status")
    .eq("automation_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  results.push({
    check_type: "knowledge_base",
    status: (kb ?? 0) > 0 ? "ok" : "warn",
    error: (kb ?? 0) > 0 ? undefined : "No knowledge documents",
    metadata: { documents: kb ?? 0, last_crawl: crawl?.[0]?.status ?? null },
  });

  const { data: ints } = await runtime.db2
    .from("integration_connections")
    .select("provider,status")
    .eq("automation_id", id);
  const integ = (ints ?? []).reduce<Record<string, string>>((m, x) => {
    m[x.provider] = x.status;
    return m;
  }, {});
  const product = String(a.automation_type);
  const need = (k: string, providers: string[], applies: boolean): Result => {
    if (!applies) return { check_type: k, status: "skip", error: "Not used by this product" };
    const st = providers.map((p) => integ[p]).find(Boolean);
    return !st
      ? { check_type: k, status: "skip", error: "Pending provider credentials" }
      : {
          check_type: k,
          status: st === "connected" ? "ok" : "fail",
          error: st === "connected" ? undefined : `Provider status: ${st}`,
        };
  };
  results.push(need("telephony", ["twilio"], product === "ai_receptionist"));
  results.push(need("messaging", ["meta", "whatsapp", "telegram"], product === "messaging_ai"));
  results.push(need("calendar", ["google_calendar", "google"], product === "ai_receptionist"));
  results.push({
    check_type: "workflow",
    status: product === "workflow_automation" ? "ok" : "skip",
    error: product === "workflow_automation" ? undefined : "Not used by this product",
  });

  const exp = a.expires_at ? new Date(a.expires_at).getTime() - Date.now() : null;
  results.push({
    check_type: "billing",
    status: exp === null ? "warn" : exp < 0 ? "fail" : exp < 7 * 86_400_000 ? "warn" : "ok",
    error:
      exp === null
        ? "No expiration date"
        : exp < 0
          ? "Subscription expired"
          : exp < 7 * 86_400_000
            ? "Expires within 7 days"
            : undefined,
    metadata: { expires_at: a.expires_at },
  });

  let overall: Overall = "HEALTHY";
  if (["suspended", "expired"].includes(runtimeState)) overall = "SUSPENDED";
  else if (runtimeState !== "active") overall = "OFFLINE";
  else if (results.some((r) => r.status === "fail" && CRITICAL.has(r.check_type)))
    overall = "ERROR";
  else if (results.some((r) => r.status === "fail")) overall = "DEGRADED";
  else if (results.some((r) => r.status === "warn")) overall = "WARNING";

  const now = new Date().toISOString();
  await runtime.db2.from("automation_health_checks").insert(
    results.map((r) => ({
      automation_id: id,
      check_type: r.check_type,
      status: r.status,
      latency_ms: r.latency_ms ?? null,
      error: r.error ?? null,
      metadata: r.metadata ?? {},
      checked_at: now,
    })),
  );
  const { data: prev } = await runtime.db2
    .from("automation_health_state")
    .select("*")
    .eq("automation_id", id);
  const prevMap = new Map((prev ?? []).map((p) => [p.check_type, p]));
  await runtime.db2.from("automation_health_state").upsert(
    results.map((r) => {
      const p = prevMap.get(r.check_type);
      const failed = r.status === "fail";
      return {
        automation_id: id,
        check_type: r.check_type,
        status: r.status,
        latency_ms: r.latency_ms ?? null,
        last_error: r.error ?? null,
        last_checked_at: now,
        last_success_at: r.status === "ok" ? now : (p?.last_success_at ?? null),
        last_failure_at: failed ? now : (p?.last_failure_at ?? null),
        failure_count: failed ? (p?.failure_count ?? 0) + 1 : 0,
        recovered_at: !failed && p?.status === "fail" ? now : (p?.recovered_at ?? null),
      };
    }),
  );
  const bad = results
    .filter((r) => r.status === "fail" || r.status === "warn")
    .map((r) => r.check_type);
  await runtime.db2.from("automation_health").upsert({
    automation_id: id,
    overall,
    summary: runtimeState !== "active" ? `Runtime: ${runtimeState}` : bad.join(", "),
    checked_at: now,
  });
  return { overall, runtime: runtimeState, results };
}

export async function probeAll(runtime: RuntimeAdmin, appOrigin: string) {
  const { data } = await runtime.db2.from("client_automations").select("id");
  const out: { id: string; overall: string }[] = [];
  for (const r of (data ?? []) as { id: string }[])
    out.push({ id: r.id, overall: (await probeAutomation(runtime, r.id, appOrigin)).overall });
  return out;
}
