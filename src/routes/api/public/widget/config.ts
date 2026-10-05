import { createFileRoute } from "@tanstack/react-router";
import { normalizeWidgetConfig } from "@/lib/widget-config";
import { adminClient, fail, json, originAllowed, preflight, resolveInstallation, widgetEnabledGlobally, runtimeState, markInstalled } from "@/lib/widget.server";

export const Route = createFileRoute("/api/public/widget/config")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request.headers.get("origin")),
      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const runtime = adminClient();
        if (!(await widgetEnabledGlobally(runtime))) return fail("Assistant is offline", 503, origin, "offline");
        const inst = await resolveInstallation(runtime, token);
        if (!inst) return fail("Unknown installation", 404, origin, "invalid_token");
        if (!originAllowed(inst, origin, new URL(request.url).host)) return fail("Domain not authorised", 403, origin, "domain");
        if ((await runtimeState(runtime, inst.id)) !== "active") return fail("This assistant is not available", 403, origin, "inactive");
        await markInstalled(runtime, inst, origin, new URL(request.url).host);
        const config = normalizeWidgetConfig(inst.widget_config);
        return json({ product: inst.automation_type, config }, 200, origin);
      },
    },
  },
});
