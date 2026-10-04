import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduler entry point for the automation worker. Requires Authorization: Bearer <CRON_SECRET>.
async function run(request: Request) {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  const { runAutomationWorker } = await import("@/lib/automation-engine.server");
  try { return Response.json({ ok: true, ...(await runAutomationWorker({ limit: 10 })) }); }
  catch (e) { console.error("automation worker failed", e); return Response.json({ ok: false, error: "worker_failed" }, { status: 500 }); }
}
export const Route = createFileRoute("/api/public/automations/worker")({ server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } } });
