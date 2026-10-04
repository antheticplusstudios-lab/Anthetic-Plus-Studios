/**
 * Voice orchestration: speech input -> assistant session -> speech output.
 * Contains no business logic; it only drives the shared assistant session.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isSpeechInputSupported, listenOnce, requestMicrophone, type ListenHandle, type SpeechInputError } from "./speech-input";
import { isSpeechOutputSupported, speak, stopSpeaking } from "./speech-output";

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

const ERROR_TEXT: Record<SpeechInputError | "tts", string> = {
  mic_denied: "Microphone access is blocked. Allow it in your browser settings, or type below.",
  no_mic: "No microphone was found. You can type your message instead.",
  no_speech: "I didn't hear anything. Tap the mic and try again.",
  network: "Speech recognition lost its connection. Please try again or type below.",
  unsupported: "Voice input isn't supported in this browser. You can type instead.",
  failed: "Voice input stopped unexpectedly. Please try again.",
  tts: "I couldn't play audio, but the reply is shown below.",
};

export function useVoiceLoop(send: (text: string) => Promise<string | null>) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState({ input: false, output: false });
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const stateRef = useRef<VoiceState>("idle");
  const handle = useRef<ListenHandle | null>(null);
  const active = useRef(false);

  // Single choke point so handlers/callbacks can read the CURRENT state without stale closures.
  const setVoiceState = useCallback((next: VoiceState | ((prev: VoiceState) => VoiceState)) => {
    const value = typeof next === "function" ? next(stateRef.current) : next;
    stateRef.current = value;
    setState(value);
  }, []);

  useEffect(() => {
    setSupported({ input: isSpeechInputSupported(), output: isSpeechOutputSupported() });
    return () => {
      active.current = false;
      handle.current?.abort();
      stopSpeaking();
    };
  }, []);

  const listen = useCallback(() => {
    setInterim("");
    setVoiceState("listening");
    handle.current = listenOnce({
      onInterim: setInterim,
      onError: (err) => {
        if (err === "no_speech" && active.current) {
          active.current = false;
          setVoiceState("idle");
          return;
        }
        active.current = false;
        setError(ERROR_TEXT[err]);
        setVoiceState("error");
      },
      onFinal: async (text) => {
        setInterim("");
        if (mutedRef.current || !active.current) {
          setVoiceState("idle");
          return;
        }
        setError(null);
        setVoiceState("processing");
        let reply: string | null;
        try {
          reply = await send(text);
        } catch {
          if (active.current) {
            setError("I couldn't reach the assistant. Please try again or type your message.");
            setVoiceState("error");
          } else {
            setVoiceState("idle");
          }
          return;
        }
        if (!active.current) {
          setVoiceState("idle");
          return;
        }
        if (reply === null) {
          // Empty/cancelled turn: never leave the ring stuck in "processing".
          if (!mutedRef.current) listen();
          else setVoiceState("idle");
          return;
        }
        if (!isSpeechOutputSupported()) {
          if (active.current && !mutedRef.current) listen();
          else setVoiceState("idle");
          return;
        }
        setVoiceState("speaking");
        speak(reply, {
          onEnd: () => {
            if (active.current && !mutedRef.current) listen();
            else setVoiceState("idle");
          },
          onError: () => {
            setError(ERROR_TEXT.tts);
            if (active.current && !mutedRef.current) listen();
            else setVoiceState("idle");
          },
        });
      },
      onEnd: () => {
        handle.current = null;
        setVoiceState((s) => (s === "listening" ? "idle" : s));
      },
    });
  }, [send, setVoiceState]);

  const start = useCallback(async () => {
    setError(null);
    if (!isSpeechInputSupported()) {
      setError(ERROR_TEXT.unsupported);
      setVoiceState("error");
      return;
    }
    const perm = await requestMicrophone();
    if (perm) {
      setError(ERROR_TEXT[perm]);
      setVoiceState("error");
      return;
    }
    active.current = true;
    mutedRef.current = false;
    setMuted(false);
    listen();
  }, [listen, setVoiceState]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      // Mute stops the microphone immediately. A reply that is processing/speaking is allowed to finish;
      // the loop will not re-open the mic afterwards while muted.
      handle.current?.abort();
      handle.current = null;
      setInterim("");
      if (stateRef.current === "listening" || stateRef.current === "error") setVoiceState("idle");
    } else if (active.current && stateRef.current === "idle") {
      // Only re-open the mic when nothing else is in flight (never while speaking, or the mic hears the TTS).
      listen();
    }
  }, [listen, setVoiceState]);

  const stop = useCallback(() => {
    active.current = false;
    handle.current?.abort();
    handle.current = null;
    stopSpeaking();
    setInterim("");
    setVoiceState("idle");
    mutedRef.current = false;
    setMuted(false);
  }, [setVoiceState]);

  /** Speak a reply that came from typed input, when voice mode is idle. */
  const say = useCallback((text: string) => {
    if (!isSpeechOutputSupported() || muted) return;
    setVoiceState("speaking");
    speak(text, { onEnd: () => setVoiceState("idle"), onError: () => setVoiceState("idle") });
  }, [muted, setVoiceState]);

  return { state, interim, error, supported, muted, start, stop, toggleMute, say, clearError: () => setError(null) };
}
