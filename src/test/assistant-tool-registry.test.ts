import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOLS } from "@/assistant/assistant.tools.server";
import { normalizeConfig } from "@/assistant/sites/site-config.server";
import { SITE_TOOL_CATALOG } from "@/assistant/sites/site-registry";

describe("website assistant tool registry", () => {
  it("keeps every registered tool available to the site authorization catalog", () => {
    const catalog = new Set(SITE_TOOL_CATALOG.map((tool) => tool.name));
    for (const tool of ASSISTANT_TOOLS) {
      expect(catalog.has(tool.name)).toBe(true);
    }
  });

  it("migrates legacy first-party tool names without enabling side-effect tools", () => {
    const config = normalizeConfig("antheticplus", {
      allowedTools: ["search_site_knowledge", "get_subscriptions", "platform_overview"],
    });

    expect(config.allowedTools).toContain("get_subscription");
    expect(config.allowedTools).toContain("get_platform_overview");
    expect(config.allowedTools).toContain("get_dashboard_guide");
    expect(config.allowedTools).not.toContain("get_subscriptions");
    expect(config.allowedTools).not.toContain("platform_overview");
    expect(config.allowedTools).not.toContain("send_email");
  });
});
