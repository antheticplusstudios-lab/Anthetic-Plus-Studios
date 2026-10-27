import type { AiOrbState } from "./ai-orb";

const SPEED: Record<AiOrbState, number> = {
  idle: 22.5,
  listening: 32,
  processing: 56,
  speaking: 38,
  success: 26,
  error: 18,
};

/** Integrate velocity, never derive phase from a changing animation duration. */
export function advanceOrbit(angle: number, velocity: number, state: AiOrbState, dt: number) {
  const elapsed = Math.max(0, Math.min(dt, 0.05));
  const nextVelocity = velocity + (SPEED[state] - velocity) * (1 - Math.exp(-3 * elapsed));
  return { angle: angle + ((velocity + nextVelocity) / 2) * elapsed, velocity: nextVelocity };
}
