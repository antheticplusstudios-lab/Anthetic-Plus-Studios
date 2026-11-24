/**
 * One persistent microphone session for a whole voice conversation.
 *
 * Root-cause fix: the old code opened a NEW getUserMedia stream for every turn and a SECOND one
 * (the barge-in monitor) every time the assistant started speaking, restarting it every 20s. On
 * Android Chrome each new capture stream with echo cancellation re-routes audio into
 * "communication" mode, which ducks/pauses the playing <audio> element for a moment — heard as the
 * reply starting, cutting out, then resuming mid-sentence. Keeping one stream open for the session
 * keeps audio routing stable and lets the noise floor be learned once.
 */
import {
  BARGE_CONFIG,
  LISTEN_CONFIG,
  VadDetector,
  bandEnergyRatio,
  frameRms,
  type VadMode,
} from "./vad";

export type MicError = "mic_denied" | "no_mic" | "unsupported" | "failed" | "device_lost";

export type Utterance = { blob: Blob; mimeType: string; speechMs: number };

type Handlers = {
  onLevel?: (level: number) => void;
  /** Listen mode: the user started talking. */
  onSpeechStart?: () => void;
  /** Listen mode: a complete utterance is ready for transcription. */
  onUtterance?: (u: Utterance) => void;
  /** Listen mode: nobody spoke for `idleMs`. */
  onIdle?: () => void;
  /** Barge mode: the user is genuinely speaking over the assistant. Recording already runs. */
  onBargeIn?: () => void;
  onError?: (e: MicError) => void;
};

const FRAME_MS = 20;
const MAX_UTTERANCE_MS = 45_000;
const IDLE_MS = 20_000;

export function supportedMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

export function micErrorFrom(e: unknown): MicError {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "mic_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_mic";
  return "failed";
}

export class MicSession {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private vad = new VadDetector(LISTEN_CONFIG, 0);
  private mode: VadMode | "off" = "off";
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recordStartedAt = 0;
  private modeStartedAt = 0;
  private speechSeen = false;
  private handlers: Handlers = {};
  private closed = false;
  readonly mimeType = supportedMime();

  async open(handlers: Handlers) {
    this.handlers = handlers;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error("unsupported"), { name: "Unsupported" });
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (this.closed) return this.close();
    for (const track of this.stream.getAudioTracks()) {
      track.addEventListener("ended", () => {
        if (!this.closed) this.handlers.onError?.("device_lost");
      });
    }
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => undefined);
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    source.connect(this.analyser);
    const time = new Float32Array(this.analyser.fftSize);
    const freq = new Float32Array(this.analyser.frequencyBinCount);
    // setInterval, not requestAnimationFrame: rAF stops when the screen dims or the tab hides.
    this.timer = setInterval(() => this.tick(time, freq), FRAME_MS);
  }

  get isOpen() {
    return !!this.stream && !this.closed;
  }

  private startRecorder() {
    if (!this.stream) return;
    this.chunks = [];
    try {
      const rec = new MediaRecorder(
        this.stream,
        this.mimeType ? { mimeType: this.mimeType, audioBitsPerSecond: 32_000 } : undefined,
      );
      rec.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      rec.onerror = () => this.handlers.onError?.("failed");
      rec.start(100);
      this.recorder = rec;
      this.recordStartedAt = performance.now();
    } catch {
      this.recorder = null;
      this.handlers.onError?.("failed");
    }
  }

  /** Stops the recorder and resolves with everything it captured (including the final chunk). */
  private stopRecorder(): Promise<Blob | null> {
    const rec = this.recorder;
    this.recorder = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      const chunks = this.chunks;
      rec.onstop = () =>
        resolve(chunks.length ? new Blob(chunks, { type: this.mimeType || "audio/webm" }) : null);
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  private discardRecorder() {
    const rec = this.recorder;
    this.recorder = null;
    this.chunks = [];
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }

  /** Start capturing the next user utterance. Recording begins now so first syllables are kept. */
  listen() {
    if (!this.isOpen) return;
    const now = performance.now();
    this.mode = "listen";
    this.modeStartedAt = now;
    this.speechSeen = false;
    this.vad.reset(LISTEN_CONFIG, now);
    this.discardRecorder();
    this.startRecorder();
  }

  /** Watch for the user talking over the assistant. Nothing is recorded until a candidate onset. */
  watchForBargeIn() {
    if (!this.isOpen) return;
    const now = performance.now();
    this.mode = "barge";
    this.modeStartedAt = now;
    this.vad.reset(BARGE_CONFIG, now);
    this.discardRecorder();
  }

  /** Pause detection (processing / muted). Keeps the stream open so audio routing stays stable. */
  pause() {
    this.mode = "off";
    this.discardRecorder();
    this.handlers.onLevel?.(-1);
  }

  /** Finish the current utterance now (user tapped "done"). */
  async flush() {
    if (this.mode !== "listen") return;
    this.mode = "off";
    const blob = await this.stopRecorder();
    if (blob && this.speechSeen) {
      this.handlers.onUtterance?.({ blob, mimeType: this.mimeType || "audio/webm", speechMs: 0 });
    } else this.handlers.onIdle?.();
  }

  private tick(time: Float32Array<ArrayBuffer>, freq: Float32Array<ArrayBuffer>) {
    if (!this.analyser || !this.ctx || this.mode === "off") return;
    this.analyser.getFloatTimeDomainData(time);
    this.analyser.getFloatFrequencyData(freq);
    const rms = frameRms(time);
    const band = bandEnergyRatio(freq, this.ctx.sampleRate);
    const now = performance.now();
    const { on } = this.vad.thresholds;
    this.handlers.onLevel?.(Math.min(1, rms / Math.max(on * 3, 0.02)));
    const ev = this.vad.process(rms, band, now);

    if (this.mode === "barge") {
      if (ev?.type === "candidate")
        this.startRecorder(); // keep onset audio of a possible interruption
      else if (ev?.type === "candidate_cancel") this.discardRecorder();
      else if (ev?.type === "speech_start") {
        // Hand the running recorder over to listen mode; the VAD keeps tracking this utterance.
        this.mode = "listen";
        this.speechSeen = true;
        this.modeStartedAt = now;
        this.handlers.onBargeIn?.();
      }
      return;
    }

    // listen mode
    if (ev?.type === "speech_start") {
      this.speechSeen = true;
      this.handlers.onSpeechStart?.();
    } else if (ev?.type === "speech_end") {
      this.mode = "off";
      const speechMs = ev.speechMs;
      void this.stopRecorder().then((blob) => {
        if (blob)
          this.handlers.onUtterance?.({ blob, mimeType: this.mimeType || "audio/webm", speechMs });
        else this.handlers.onIdle?.();
      });
    } else if (ev?.type === "discard") {
      // A cough or click: throw it away and keep listening with a fresh recording.
      this.speechSeen = false;
      this.discardRecorder();
      this.startRecorder();
    } else if (!this.vad.speaking) {
      // Keep uploads small during long silences (never while a candidate onset is in progress).
      if (!this.speechSeen && now - this.recordStartedAt > 8_000 && ev === null) {
        this.discardRecorder();
        this.startRecorder();
      }
      if (!this.speechSeen && now - this.modeStartedAt > IDLE_MS) {
        this.mode = "off";
        this.discardRecorder();
        this.handlers.onIdle?.();
      }
    }
    if (this.vad.speaking && now - this.recordStartedAt > MAX_UTTERANCE_MS) void this.flush();
  }

  close() {
    this.closed = true;
    this.mode = "off";
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.discardRecorder();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
    this.handlers.onLevel?.(-1);
  }
}
