import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled auto-training. Requires Authorization: Bearer <CRON_SECRET>.
async function run(request: Request) {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  const { trainEverything } = await import("@/lib/training.server");
  try {
    return Response.json({ ok: true, results: await trainEverything() });
  } catch (e) {
    console.error("training run failed", e);
    return Response.json({ ok: false, error: "training_failed" }, { status: 500 });
  }
}
export const Route = createFileRoute("/api/public/training/run")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
