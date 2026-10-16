import { describe, expect, it } from "vitest";
import { ENGINE_KIND_BY_SLUG, automations } from "@/lib/automations";
import { orderKeys, parsePool } from "@/lib/provider-pool";
import { evaluateRuntime } from "@/lib/runtime-gate";

const keys = [
  { id: "g", provider_key: "groq", priority: 1, request_count: 10 },
  { id: "o", provider_key: "openrouter", priority: 2, request_count: 2 },
  { id: "a", provider_key: "openai", priority: 3, request_count: 5 },
];
const m = (p: string, priority: number, weight = 1, enabled = true) => ({
  provider: p,
  priority,
  weight,
  enabled,
  model: null,
});

describe("catalog mapping", () => {
  it("maps the four canonical slugs to engine kinds", () => {
    expect(ENGINE_KIND_BY_SLUG).toEqual({
      "voice-sms-receptionist": "ai_receptionist",
      "lead-capture-qualifier": "lead_capture",
      "knowledge-base-support": "kb_support",
      "social-dm-assistant": "messaging_ai",
    });
    for (const slug of Object.keys(ENGINE_KIND_BY_SLUG))
      expect(automations.some((a) => a.slug === slug)).toBe(true);
  });
});

describe("provider pool", () => {
  it("priority orders by configured priority and drops disabled providers", () => {
    const pool = {
      strategy: "priority" as const,
      members: [m("openai", 1), m("groq", 2), m("openrouter", 3, 1, false)],
    };
    expect(orderKeys(keys, pool).map((k) => k.id)).toEqual(["a", "g"]);
  });
  it("balanced picks the least-used key first", () => {
    expect(
      orderKeys(keys, {
        strategy: "balanced",
        members: [m("groq", 1), m("openrouter", 2), m("openai", 3)],
      }).map((k) => k.id),
    ).toEqual(["o", "a", "g"]);
  });
  it("weighted respects weights and keeps the rest as fallback", () => {
    const pool = {
      strategy: "weighted" as const,
      members: [m("groq", 1, 60), m("openrouter", 2, 30), m("openai", 3, 10)],
    };
    expect(orderKeys(keys, pool, () => 0.1)[0]!.id).toBe("g");
    expect(orderKeys(keys, pool, () => 0.7)[0]!.id).toBe("o");
    expect(orderKeys(keys, pool, () => 0.95)).toHaveLength(3);
  });
  it("falls back to key priority without a pool and rejects bad pools", () => {
    expect(orderKeys(keys, null).map((k) => k.id)).toEqual(["g", "o", "a"]);
    expect(parsePool({ strategy: "nope", members: [] })).toBeNull();
  });
});

describe("runtime gate", () => {
  it("active executes; paused, expired, disabled block; testing only runs tests", () => {
    expect(evaluateRuntime({ status: "active", run_state: "active", is_active: true })).toBeNull();
    expect(evaluateRuntime({ status: "paused" })).toBe("paused");
    expect(evaluateRuntime({ status: "active", expires_at: "2000-01-01" })).toBe("expired");
    expect(evaluateRuntime({ status: "active", is_active: false })).toBe("disabled");
    expect(evaluateRuntime({ status: "active", run_state: "testing" })).toBe("testing_only");
    expect(
      evaluateRuntime({ status: "active", run_state: "testing" }, { isTest: true }),
    ).toBeNull();
    expect(evaluateRuntime(null)).toBe("automation_not_found");
  });
});
