import { describe, expect, it } from "vitest";
import * as cfg from "@/lib/automation-config";
import { journeyStage } from "@/lib/order-journey";
import { movePoolMember, orderKeys, poolShares, type ProviderPool } from "@/lib/provider-pool";
import { evaluateRuntime } from "@/lib/runtime-gate";
import { automations, ENGINE_KIND_BY_SLUG } from "@/lib/automations";

const NOW = Date.parse("2026-10-07T00:00:00Z");

describe("catalog", () => {
  it("has exactly the four canonical slugs mapped to their engines", () => {
    expect(ENGINE_KIND_BY_SLUG).toMatchObject({
      "voice-sms-receptionist": "ai_receptionist",
      "lead-capture-qualifier": "lead_capture",
      "knowledge-base-support": "kb_support",
      "social-dm-assistant": "messaging_ai",
    });
    const slugs = automations.map((a) => a.slug);
    for (const legacy of ["ai-receptionist", "lead-reactivation", "social-dm", "review-engine"])
      expect(slugs).not.toContain(legacy);
  });
});

describe("runtime gate", () => {
  it("blocks paused, expired and testing (non-test) work", () => {
    expect(evaluateRuntime({ status: "active", run_state: "paused" })).toBe("paused");
    expect(evaluateRuntime({ status: "active", expires_at: "2026-01-01" }, { now: NOW })).toBe(
      "expired",
    );
    expect(evaluateRuntime({ status: "active", run_state: "testing" })).toBe("testing_only");
    expect(
      evaluateRuntime({ status: "active", run_state: "testing" }, { isTest: true }),
    ).toBeNull();
    expect(evaluateRuntime({ status: "active", run_state: "active" })).toBeNull();
  });
});

describe("deployment state, badges and My Automations", () => {
  const row = (o: Partial<cfg.DeploymentRow>) => ({
    automation_type: "lead_capture",
    status: "active",
    run_state: "active",
    is_active: true,
    ...o,
  });
  it("derives state from DB2 columns", () => {
    expect(cfg.deploymentStateOf(row({}), NOW)).toBe("active");
    expect(cfg.deploymentStateOf(row({ run_state: "paused" }), NOW)).toBe("paused");
    expect(cfg.deploymentStateOf(row({ run_state: "testing" }), NOW)).toBe("testing");
    expect(cfg.deploymentStateOf(row({ expires_at: "2026-01-01" }), NOW)).toBe("expired");
    expect(cfg.deploymentStateOf(row({ status: "provisioning", run_state: null }), NOW)).toBe(
      "provisioning",
    );
  });
  it("badges come from deployments and keep the best state per product", () => {
    const b = cfg.userBadges(
      [
        row({ run_state: "paused" }),
        row({}),
        row({ automation_type: "kb_support", run_state: "testing" }),
      ],
      NOW,
    );
    expect(b).toEqual([
      { kind: "lead_capture", label: "Lead Qualifier", state: "active" },
      { kind: "kb_support", label: "Knowledge Support", state: "testing" },
    ]);
    expect(cfg.userBadges([], NOW)).toEqual([]);
  });
  it("status and next action follow setup progress", () => {
    const p = cfg.setupProgress("kb_support", {}, "active", false);
    expect(cfg.customerStatus("active", p, null)).toBe("SETUP REQUIRED");
    expect(cfg.nextAction("active", p, null)).toBe("Complete: Business profile");
    expect(cfg.nextAction("expired", p, null)).toBe("Renew to resume service");
    expect(cfg.customerStatus("paused", p, null)).toBe("PAUSED");
  });
});

describe("order journey", () => {
  it("never skips human verification", () => {
    expect(journeyStage({}).key).toBe("review");
    expect(
      journeyStage({ orderStatus: "pending_verification", paymentStatus: "pending" }).key,
    ).toBe("verification");
    expect(journeyStage({ orderStatus: "verified", paymentStatus: "verified" }).key).toBe(
      "configuration",
    );
    expect(journeyStage({ paymentStatus: "rejected" }).blocked).toMatch(/not verified/);
    expect(journeyStage({ orderStatus: "verified", deploymentState: "testing" }).key).toBe(
      "testing",
    );
    expect(journeyStage({ orderStatus: "verified", deploymentState: "active" }).key).toBe("active");
  });
});

describe("provider pool", () => {
  const pool: ProviderPool = {
    strategy: "weighted",
    members: [
      { provider: "groq", enabled: true, weight: 60, priority: 1 },
      { provider: "openrouter", enabled: true, weight: 30, priority: 2 },
      { provider: "openai", enabled: true, weight: 10, priority: 3 },
    ],
  };
  const keys = [
    { id: "a", provider_key: "openai", priority: 1, request_count: 5 },
    { id: "b", provider_key: "groq", priority: 2, request_count: 9 },
    { id: "c", provider_key: "openrouter", priority: 3, request_count: 1 },
  ];
  it("weighted shares match the example 60/30/10", () => {
    expect(poolShares(pool).map((s) => s.percent)).toEqual([60, 30, 10]);
  });
  it("priority + fallback tries #1 then #2 then #3", () => {
    expect(orderKeys(keys, { ...pool, strategy: "priority" }).map((k) => k.provider_key)).toEqual([
      "groq",
      "openrouter",
      "openai",
    ]);
  });
  it("balanced picks the least-used provider first", () => {
    expect(orderKeys(keys, { ...pool, strategy: "balanced" })[0]!.provider_key).toBe("openrouter");
  });
  it("disabled providers are never used", () => {
    const p = {
      ...pool,
      strategy: "priority" as const,
      members: pool.members.map((m) => (m.provider === "groq" ? { ...m, enabled: false } : m)),
    };
    expect(orderKeys(keys, p).map((k) => k.provider_key)).not.toContain("groq");
  });
  it("reordering renumbers priorities", () => {
    const moved = movePoolMember(pool, "openai", -1);
    expect(moved.members.find((m) => m.provider === "openai")!.priority).toBe(2);
  });
});

describe("config fingerprint", () => {
  it("changes when saved settings change", () => {
    expect(cfg.configVersion({ a: "1" })).not.toBe(cfg.configVersion({ a: "2" }));
    expect(cfg.configVersion({ a: "1", b: "x" })).toBe(cfg.configVersion({ b: "x", a: "1" }));
  });
  it("prompts include new product-specific fields", () => {
    expect(cfg.receptionistPrompt({ greeting: "Hi from Acme" })).toContain("Hi from Acme");
    expect(cfg.dmPrompt({ brand_tone: "playful" })).toContain("playful");
    expect(cfg.kbPrompt({ answer_style: "step-by-step" }, "")).toContain("step-by-step");
  });
});
