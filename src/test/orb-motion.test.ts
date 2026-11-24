import { describe, expect, it } from "vitest";
import { advanceOrbit } from "@/components/assistant/orb-motion";
import type { AiOrbState } from "@/components/assistant/ai-orb";

describe("continuous assistant orbit", () => {
  it("preserves phase through every real assistant state without jumping", () => {
    let angle = 725;
    let velocity = 22.5;
    for (const state of [
      "listening",
      "processing",
      "speaking",
      "success",
      "error",
      "idle",
    ] satisfies AiOrbState[]) {
      const next = advanceOrbit(angle, velocity, state, 1 / 60);
      expect(next.angle).toBeGreaterThan(angle);
      expect(next.angle - angle).toBeLessThan(1);
      expect(Math.abs(next.velocity - velocity)).toBeLessThan(2);
      angle = next.angle;
      velocity = next.velocity;
    }
  });
  it("keeps idle rotation steady at different frame rates", () => {
    for (const fps of [30, 60, 120]) {
      let angle = 0;
      for (let i = 0; i < fps * 4; i++) angle = advanceOrbit(angle, 22.5, "idle", 1 / fps).angle;
      expect(angle).toBeCloseTo(90, 6);
    }
  });
  it("does not advance while paused and bounds a resumed frame", () => {
    expect(advanceOrbit(123, 22.5, "speaking", 0).angle).toBe(123);
    expect(advanceOrbit(123, 22.5, "processing", 60).angle - 123).toBeLessThan(2);
  });
});
