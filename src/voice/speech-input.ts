/** Multilingual speech input: MediaRecorder + server-side Groq Whisper. */
import { transcribeVoiceAudio } from "@/lib/voice-transcription.functions";

export type SpeechInputError = "mic_denied" | "no_mic" | "no_speech" | "network" | "unsupported" | "failed";
export type SpeechInputResult = { text: string; language: string | null };

export type ListenHandle = { stop: () => void; abort: () => void };

type Options = {
  onInterim?: (text: string) => void;
  onSpeechStart?: () => void;
  onFinal: (result: SpeechInputResult) => void;
  onError: (err: SpeechInputError) => void;
  onEnd: () => void;
};

export function isSpeechInputSupported() {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
}

export async function requestMicrophone(): Promise<SpeechInputError | null> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotAllowedError" || name === "SecurityError") return "mic_denied";
    if (name === "NotFoundError") return "no_mic";
    return "failed";
  }
}

function supportedMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function listenOnce(opts: Options): ListenHandle | null {
  if (!isSpeechInputSupported()) {
    opts.onError("unsupported");
    return null;
  }

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let context: AudioContext | null = null;
  let raf = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let speechDetected = false;
  let stopped = false;
  let aborted = false;
  const chunks: BlobPart[] = [];
  const mimeType = supportedMime() || "audio/webm";

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    if (silenceTimer) clearTimeout(silenceTimer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void context?.close().catch(() => undefined);
    context = null;
  };

  const finish = async () => {
    if (stopped) return;
    stopped = true;
    try {
      recorder?.stop();
    } catch {
      /* already stopped */
    }
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (stopped) return cleanup();

      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        cleanup();
        opts.onError("failed");
        opts.onEnd();
      };
      recorder.onstop = async () => {
        cleanup();
        if (aborted || !chunks.length) {
          opts.onEnd();
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          opts.onError("no_speech");
          opts.onEnd();
          return;
        }
        try {
          const audioBase64 = await toDataUrl(blob);
          const result = await transcribeVoiceAudio({ data: { audioBase64, mimeType } });
          if (aborted) return;
          if (result.text.trim()) opts.onFinal(result);
          else opts.onError("no_speech");
        } catch (error) {
          const message = String(error);
          opts.onError(/network|fetch|timeout/i.test(message) ? "network" : "failed");
        } finally {
          opts.onEnd();
        }
      };

      const audioContext = new AudioContext();
      context = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      startedAt = performance.now();
      recorder.start(250);

      const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const elapsed = performance.now() - startedAt;
        if (rms > 0.035) {
          if (!speechDetected) {
            speechDetected = true;
            opts.onSpeechStart?.();
          }
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = null;
          opts.onInterim?.("Listening…");
        } else if (speechDetected && !silenceTimer && elapsed > 700) {
          silenceTimer = setTimeout(() => void finish(), 850);
        }
        if (elapsed >= 12_000) void finish();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch (error) {
      cleanup();
      const name = (error as { name?: string }).name;
      opts.onError(name === "NotAllowedError" ? "mic_denied" : name === "NotFoundError" ? "no_mic" : "failed");
      opts.onEnd();
    }
  })();

  return {
    stop: () => void finish(),
    abort: () => {
      aborted = true;
      stopped = true;
      try {
        recorder?.stop();
      } catch {
        cleanup();
        opts.onEnd();
      }
    },
  };
}

export function monitorSpeechStart(opts: { onSpeechStart: () => void; onError?: (err: SpeechInputError) => void; onEnd?: () => void }): ListenHandle | null {
  if (!isSpeechInputSupported()) {
    opts.onError?.("unsupported");
    return null;
  }

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let speechFrames = 0;

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    timer = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void context?.close().catch(() => undefined);
    context = null;
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (stopped) return cleanup();
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      timer = setTimeout(() => {
        if (!stopped) {
          stopped = true;
          cleanup();
          opts.onEnd?.();
        }
      }, 20_000);

      const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        if (rms > 0.045) speechFrames += 1; else speechFrames = 0;
        if (speechFrames >= 3) {
          stopped = true;
          cleanup();
          opts.onSpeechStart();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch (error) {
      cleanup();
      if (stopped) return;
      stopped = true;
      const name = (error as { name?: string }).name;
      opts.onError?.(name === "NotAllowedError" ? "mic_denied" : name === "NotFoundError" ? "no_mic" : "failed");
      opts.onEnd?.();
    }
  })();

  return {
    stop: () => {
      stopped = true;
      cleanup();
      opts.onEnd?.();
    },
    abort: () => {
      stopped = true;
      cleanup();
    },
  };
}
