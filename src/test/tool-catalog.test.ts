import { describe, expect, it } from "vitest";
import { validateProposal } from "@/lib/tool-catalog";

describe("tool request proposals", () => {
  it("drops tools outside the automation's catalog", () => {
    const p = validateProposal("kb_support", {
      summary: "x",
      tools: [
        { id: "create_payment_link", reason: "", inputs: [] },
        { id: "create_ticket", reason: "", inputs: [] },
      ],
      unsupported: [],
    });
    expect(p.tools.map((t) => t.id)).toEqual(["create_ticket"]);
    expect(p.unsupported.length).toBe(1);
  });
  it("always requires approval and flags missing integrations", () => {
    const p = validateProposal("ai_receptionist", {
      summary: "x",
      tools: [{ id: "create_booking", reason: "", inputs: [] }],
      unsupported: [],
    });
    expect(p.tools[0]!.needsApproval).toBe(true);
    expect(p.tools[0]!.setupMissing).toBe("calendar");
  });
});
