import { describe, expect, it } from "vitest";
import { adminNav } from "@/components/admin-shell";

const find = (to: string) => adminNav.find((i) => i.to === to)!;

describe("admin navigation categories", () => {
  it("keeps CRM lead Round-Robin out of AI provider infrastructure", () => {
    expect(find("/admin/automations/round-robin").group).toBe("Clients & Operations");
    expect(find("/admin/infrastructure").group).toBe("AI Infrastructure");
    expect(adminNav.some((i) => (i.to as string) === "/admin/llm-keys")).toBe(false);
  });

  it("keeps the voice channel inside the single Website AI Agent category", () => {
    expect(find("/admin/voice-agent").group).toBe("AI & Website Agent");
    expect(find("/admin/assistants").group).toBe("AI & Website Agent");
  });

  it("keeps provider keys owner-only", () => {
    expect(find("/admin/infrastructure").roles).toEqual(["owner"]);
  });

  it("has no duplicate routes", () => {
    const tos = adminNav.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });
});

describe("website installation keys menu", () => {
  it("is admin-only under AI & Website Agent", () => {
    const k = adminNav.find((i) => i.to === "/admin/site-keys")!;
    expect(k.group).toBe("AI & Website Agent");
    expect(k.roles).toEqual(["owner", "admin"]);
  });
});
