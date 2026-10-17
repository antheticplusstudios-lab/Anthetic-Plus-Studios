/**
 * Adaptive voice-activity detector (pure, no browser APIs, unit-tested).
 *
 * Why this exists: the old loop used one fixed RMS threshold (0.035) for listening and a second
 * fixed threshold (0.045, three ~16ms frames) for barge-in. Quiet speakers never crossed the first
 * one, and the assistant's own speaker echo crossed the second one within ~50ms of playback, which
 * cancelled the reply mid-sentence. This detector instead:
 *  - learns the room's noise floor continuously while nobody is talking;
 *  - requires a level clearly above that floor, inside the speech band, for a sustained onset;
 *  - keeps a hang-over so natural pauses do not end the utterance;
 *  - in "barge" mode (assistant speaking) learns the echo floor during a grace window and needs a
 *    longer, louder onset before it reports an interruption.
 */

export type VadMode = "listen" | "barge";

export type VadConfig = {
  /** Absolute minimum RMS (0..1) that can ever count as speech. ~-44 dBFS. */
  minOn: number;
  /** Level must be this many times the learned floor to start speech. */
  onRatio: number;
  /** While in speech, level above floor * offRatio keeps the utterance alive. */
  offRatio: number;
  /** Minimum share of energy in the 250–3800 Hz speech band. Rejects hum, rumble and hiss. */
  minBandRatio: number;
  /** Sustained above-threshold time before speech is confirmed. */
  onsetMs: number;
  /** Base silence needed to end an utterance; grows with the utterance length. */
  hangMs: number;
  /** Extra hang allowed for long utterances (people pause more mid-thought). */
  maxExtraHangMs: number;
  /** Utterances shorter than this (coughs, clicks) are discarded. */
  minSpeechMs: number;
  /** Ignore frames for this long after entering the mode (only learn the floor). */
  graceMs: number;
};

export const LISTEN_CONFIG: VadConfig = {
  minOn: 0.006,
  onRatio: 2.8,
  offRatio: 1.6,
  minBandRatio: 0.3,
  onsetMs: 110,
  hangMs: 1050,
  maxExtraHangMs: 700,
  minSpeechMs: 220,
  graceMs: 120,
};

/** Interruption while the assistant speaks: stricter so echo and noise do not cut the reply. */
export const BARGE_CONFIG: VadConfig = {
  minOn: 0.018,
  onRatio: 3.2,
  offRatio: 1.8,
  minBandRatio: 0.4,
  onsetMs: 300,
  hangMs: 1050,
  maxExtraHangMs: 700,
  minSpeechMs: 300,
  graceMs: 650,
};

export type VadEvent =
  | { type: "candidate" } // level rose above threshold; onset not yet confirmed
  | { type: "candidate_cancel" }
  | { type: "speech_start" }
  | { type: "speech_end"; speechMs: number }
  | { type: "discard"; speechMs: number }; // utterance too short to be speech

export class VadDetector {
  private cfg: VadConfig;
  private floor = 0;
  private floorReady = false;
  private startedAt = 0;
  private aboveSince: number | null = null;
  private inSpeech = false;
  private speechStartedAt = 0;
  private lastVoiceAt = 0;
  private voicedMs = 0;
  private lastFrameAt = 0;

  constructor(cfg: VadConfig = LISTEN_CONFIG, now = 0) {
    this.cfg = cfg;
    this.startedAt = now;
    this.lastFrameAt = now;
  }

  /** Switch mode without losing the learned noise floor. */
  reset(cfg: VadConfig, now: number) {
    this.cfg = cfg;
    this.startedAt = now;
    this.lastFrameAt = now;
    this.aboveSince = null;
    this.inSpeech = false;
    this.voicedMs = 0;
  }

  get noiseFloor() {
    return this.floor;
  }

  get speaking() {
    return this.inSpeech;
  }

  get thresholds() {
    const on = Math.max(this.cfg.minOn, this.floor * this.cfg.onRatio);
    const off = Math.max(this.cfg.minOn * 0.6, this.floor * this.cfg.offRatio);
    return { on, off };
  }

  private learn(rms: number) {
    if (!this.floorReady) {
      this.floor = rms;
      this.floorReady = true;
      return;
    }
    // Falls fast (noise stopped), rises slowly (so a talker never becomes "the floor").
    const k = rms < this.floor ? 0.12 : 0.012;
    this.floor = this.floor + (rms - this.floor) * k;
  }

  /** Feed one analysis frame. Returns at most one event. */
  process(rms: number, bandRatio: number, now: number): VadEvent | null {
    const dt = Math.max(0, Math.min(200, now - this.lastFrameAt));
    this.lastFrameAt = now;
    const inGrace = now - this.startedAt < this.cfg.graceMs;
    const { on, off } = this.thresholds;
    const voiced = bandRatio >= this.cfg.minBandRatio;

    if (inGrace) {
      this.learn(rms);
      return null;
    }

    if (!this.inSpeech) {
      if (rms >= on && voiced) {
        if (this.aboveSince === null) {
          this.aboveSince = now;
          return { type: "candidate" };
        }
        if (now - this.aboveSince >= this.cfg.onsetMs) {
          this.inSpeech = true;
          this.speechStartedAt = this.aboveSince;
          this.lastVoiceAt = now;
          this.voicedMs = now - this.aboveSince;
          return { type: "speech_start" };
        }
        return null;
      }
      // Short dips inside an onset are tolerated (plosives, syllable gaps).
      if (this.aboveSince !== null && now - this.aboveSince > this.cfg.onsetMs * 2.5) {
        this.aboveSince = null;
        this.learn(rms);
        return { type: "candidate_cancel" };
      }
      if (this.aboveSince === null) this.learn(rms);
      return null;
    }

    // In speech.
    if (rms >= off) {
      this.lastVoiceAt = now;
      if (voiced) this.voicedMs += dt;
      return null;
    }
    const speechMs = this.lastVoiceAt - this.speechStartedAt;
    const hang = this.cfg.hangMs + Math.min(this.cfg.maxExtraHangMs, speechMs * 0.12);
    if (now - this.lastVoiceAt >= hang) {
      this.inSpeech = false;
      this.aboveSince = null;
      if (this.voicedMs < this.cfg.minSpeechMs) return { type: "discard", speechMs };
      return { type: "speech_end", speechMs };
    }
    return null;
  }
}

/** RMS of a float time-domain frame (-1..1). */
export function frameRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/** Share of linear power inside [lowHz, highHz] from an analyser's dB spectrum. */
export function bandEnergyRatio(
  spectrumDb: Float32Array,
  sampleRate: number,
  lowHz = 250,
  highHz = 3800,
): number {
  const binHz = sampleRate / 2 / spectrumDb.length;
  let total = 0;
  let band = 0;
  for (let i = 1; i < spectrumDb.length; i++) {
    const db = spectrumDb[i]!;
    if (!Number.isFinite(db)) continue;
    const p = Math.pow(10, db / 10);
    total += p;
    const hz = i * binHz;
    if (hz >= lowHz && hz <= highHz) band += p;
  }
  return total > 0 ? band / total : 0;
}
