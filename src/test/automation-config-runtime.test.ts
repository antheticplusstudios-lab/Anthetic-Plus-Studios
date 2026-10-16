import { describe, expect, it } from "vitest";
import * as cfg from "@/lib/automation-config";
import { thoughtFor } from "@/components/assistant/thought-line";

describe("saved configuration changes runtime behaviour", () => {
  it("receptionist: escalation rules trigger handoff only when configured", () => {
    expect(cfg.matchesEscalation("I have an emergency", "")).toBe(false);
    expect(cfg.matchesEscalation("I have an emergency", "complaint, emergency")).toBe(true);
    expect(cfg.receptionistPrompt({ hours: "Mon–Fri 9–5" })).toContain("Mon–Fri 9–5");
  });
  it("lead: thresholds change hot/warm/cold tier", () => {
    const lead = { email: "a@b.co", phone: "1", message: "" };
    expect(cfg.scoreLead(lead, {}).tier).toBe("warm"); // 50 < default hot 60
    expect(cfg.scoreLead(lead, { hot_threshold: 50 }).tier).toBe("hot");
    expect(cfg.missingLeadFields({ email: "x" }, { required_fields: "email, company" })).toEqual([
      "company",
    ]);
  });
  it("kb: similarity threshold and citation mode come from config", () => {
    expect(cfg.kbMinSimilarity({ confidence_threshold: 0.7 })).toBe(0.7);
    expect(cfg.kbPrompt({ citation_mode: "none" }, "")).not.toContain("Cite sources");
    expect(cfg.kbPrompt({}, "")).toContain("Cite sources");
  });
  it("social: channels, handoff and rate limit come from config", () => {
    expect(cfg.dmChannelAllowed("whatsapp", { channels: "instagram" })).toBe(false);
    expect(cfg.dmChannelAllowed("instagram", { channels: "instagram, whatsapp" })).toBe(true);
    expect(cfg.dmRateLimit({ rate_limit_per_hour: 5 })).toBe(5);
    expect(cfg.dmRateLimit({})).toBe(0);
  });
  it("setup progress counts only completed product steps", () => {
    const p = cfg.setupProgress(
      "lead_capture",
      { business_info: "x", lead_source: "web", required_fields: "email" },
      "testing",
      false,
    );
    expect(p.done).toBe(2);
    expect(p.total).toBe(7);
  });
});

describe("ThoughtLine reflects real state", () => {
  it("maps states to labels", () => {
    expect(thoughtFor({ state: "listening" })).toBe("Listening…");
    expect(thoughtFor({ state: "listening", interim: "hi" })).toBe("Reading the question…");
    expect(thoughtFor({ state: "processing" })).toBe("Thinking…");
    expect(thoughtFor({ state: "speaking" })).toBe("Speaking…");
  });
});
