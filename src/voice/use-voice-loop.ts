/**
 * Voice orchestration: one persistent mic session -> transcription -> assistant -> server TTS.
 *
 * Invariants (see AGENTS.md / docs/VOICE-AGENT.md):
 *  - Exactly one microphone stream per conversation (MicSession). No per-turn or per-reply mics.
 *  - Every async continuation carries a turn id; anything from an older turn is ignored, so a
 *    stale transcription or reply can never overwrite or speak over a newer one.
 *  - Interruptions only fire on sustained speech above the learned echo floor (BARGE_CONFIG), or
 *    manually via `interrupt()`. Hands-free interruption can be switched off (speaker setups).
 *  - No browser speechSynthesis fallback: a provider failure is shown, never re-voiced.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MicSession, micErrorFrom, type MicError, type Utterance } from "./mic-session";
import { transcribeUtterance } from "./transcribe-client";
import {
  isServerSpeechSupported,
  primeServerSpeech,
  speakServer,
  stopServerSpeech,
} from "./server-speech";

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

const ERROR_TEXT: Record<MicError | "tts" | "network" | "stt", string> = {
  mic_denied: "Microphone access is blocked. Allow it in your browser settings, or type below.",
  no_mic: "No microphone was found. You can type your message instead.",
  unsupported: "Voice input isn't supported in this browser. You can type instead.",
  failed: "Voice input stopped unexpectedly. Tap the mic to try again.",
  device_lost: "Your microphone was disconnected. Tap the mic to reconnect.",
  network: "The connection dropped while transcribing. Please say that again.",
  stt: "I couldn't transcribe that. Please try again or type below.",
  tts: "I couldn't play audio, but the reply is shown below.",
};

const HANDS_FREE_KEY = "ap-voice-hands-free";

export function isVoiceInputSupported() {
  return (
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function useVoiceLoop(
  send: (
    text: string,
    language?: { language?: string | null; confidence?: number },
  ) => Promise<string | null>,
) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState({ input: false, output: false });
  const [muted, setMuted] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [handsFree, setHandsFreeState] = useState(true);
  const handsFreeRef = useRef(true);
  const mutedRef = useRef(false);
  const audioLevelRef = useRef(-1);
  const stateRef = useRef<VoiceState>("idle");
  const mic = useRef<MicSession | null>(null);
  const turn = useRef(0);
  const active = useRef(false);
  const lastLanguage = useRef<string | null>(null);
  const transcribeAbort = useRef<AbortController | null>(null);

  const setVoiceState = useCallback((value: VoiceState) => {
    stateRef.current = value;
    setState(value);
  }, []);

  useEffect(() => {
    const turnRef = turn;
    setSupported({ input: isVoiceInputSupported(), output: isServerSpeechSupported() });
    try {
      const saved = localStorage.getItem(HANDS_FREE_KEY);
      if (saved !== null) {
        handsFreeRef.current = saved === "1";
        setHandsFreeState(saved === "1");
      }
    } catch {
      /* storage blocked */
    }
    return () => {
      active.current = false;
      turn.current++;
      transcribeAbort.current?.abort();
      mic.current?.close();
      mic.current = null;
      stopServerSpeech();
    };
  }, []);

  const listenNow = useCallback(() => {
    if (!active.current || mutedRef.current || !mic.current) {
      setVoiceState("idle");
      return;
    }
    setInterim("");
    setUserSpeaking(false);
    setVoiceState("listening");
    mic.current.listen();
  }, [setVoiceState]);

  const speak = useCallback(
    (reply: string, myTurn: number, lang?: string | null) => {
      if (!isServerSpeechSupported()) return listenNow();
      setVoiceState("speaking");
      speakServer(reply, {
        ...(lang ? { lang } : {}),
        onStart: () => {
          if (myTurn !== turn.current) return;
          if (handsFreeRef.current && !mutedRef.current) mic.current?.watchForBargeIn();
        },
        onEnd: () => {
          if (myTurn !== turn.current) return;
          mic.current?.pause();
          if (active.current) listenNow();
          else setVoiceState("idle");
        },
        onError: (message) => {
          if (myTurn !== turn.current) return;
          mic.current?.pause();
          setError(message || ERROR_TEXT.tts);
          if (active.current) listenNow();
          else setVoiceState("idle");
        },
      });
    },
    [listenNow, setVoiceState],
  );

  const handleUtterance = useCallback(
    async (u: Utterance) => {
      const myTurn = ++turn.current;
      setUserSpeaking(false);
      setVoiceState("processing");
      setInterim("Transcribing…");
      transcribeAbort.current?.abort();
      const ctrl = new AbortController();
      transcribeAbort.current = ctrl;
      let result: Awaited<ReturnType<typeof transcribeUtterance>>;
      try {
        result = await transcribeUtterance(u, {
          signal: ctrl.signal,
          languageHint: lastLanguage.current,
        });
      } catch (e) {
        if (myTurn !== turn.current) return;
        setInterim("");
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        setError(offline || /network|fetch/i.test(String(e)) ? ERROR_TEXT.network : ERROR_TEXT.stt);
        return listenNow();
      }
      if (myTurn !== turn.current) return;
      setInterim("");
      if (!result.text) return listenNow(); // silence / noise / hallucination: keep listening
      if (result.language) lastLanguage.current = result.language;
      setError(null);
      let reply: string | null;
      try {
        reply = await send(result.text, {
          language: result.language,
          ...(result.language ? { confidence: 0.95 } : {}),
        });
      } catch {
        if (myTurn !== turn.current) return;
        setError("I couldn't reach the assistant. Please try again or type your message.");
        return listenNow();
      }
      if (myTurn !== turn.current || !active.current) return;
      if (!reply) return listenNow();
      speak(reply, myTurn, result.language);
    },
    [listenNow, send, setVoiceState, speak],
  );

  const interrupt = useCallback(() => {
    if (stateRef.current !== "speaking" && stateRef.current !== "processing") return;
    turn.current++;
    stopServerSpeech();
    transcribeAbort.current?.abort();
    if (active.current) listenNow();
    else setVoiceState("idle");
  }, [listenNow, setVoiceState]);

  const start = useCallback(async () => {
    primeServerSpeech(); // must run inside the user's tap so replies may play later
    setError(null);
    if (!isVoiceInputSupported()) {
      setError(ERROR_TEXT.unsupported);
      setVoiceState("error");
      return;
    }
    if (mic.current?.isOpen) {
      active.current = true;
      mutedRef.current = false;
      setMuted(false);
      listenNow();
      return;
    }
    const session = new MicSession();
    mic.current = session;
    try {
      await session.open({
        onLevel: (level) => {
          audioLevelRef.current = level;
        },
        onSpeechStart: () => {
          setUserSpeaking(true);
          setInterim("Listening…");
        },
        onUtterance: (u) => void handleUtterance(u),
        onIdle: () => {
          if (stateRef.current !== "listening") return;
          // Nobody spoke for a while: end hands-free mode quietly instead of looping forever.
          active.current = false;
          setInterim("");
          setUserSpeaking(false);
          setVoiceState("idle");
        },
        onBargeIn: () => {
          if (stateRef.current !== "speaking") return;
          turn.current++; // the reply being spoken is now stale
          stopServerSpeech();
          setUserSpeaking(true);
          setInterim("Listening…");
          setVoiceState("listening");
        },
        onError: (err) => {
          active.current = false;
          turn.current++;
          stopServerSpeech();
          mic.current?.close();
          mic.current = null;
          setError(ERROR_TEXT[err]);
          setVoiceState("error");
        },
      });
    } catch (e) {
      session.close();
      mic.current = null;
      const err = (e as { name?: string }).name === "Unsupported" ? "unsupported" : micErrorFrom(e);
      setError(ERROR_TEXT[err]);
      setVoiceState("error");
      return;
    }
    active.current = true;
    mutedRef.current = false;
    setMuted(false);
    listenNow();
  }, [handleUtterance, listenNow, setVoiceState]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      // Mute stops listening immediately; an in-flight reply may finish but won't reopen the mic.
      mic.current?.pause();
      setInterim("");
      setUserSpeaking(false);
      if (stateRef.current === "listening" || stateRef.current === "error") setVoiceState("idle");
    } else if (active.current && stateRef.current === "idle") {
      listenNow();
    } else if (stateRef.current === "speaking" && handsFreeRef.current) {
      mic.current?.watchForBargeIn();
    }
  }, [listenNow, setVoiceState]);

  /** User tapped "done talking": send what was said without waiting for the pause timeout. */
  const finishUtterance = useCallback(() => {
    if (stateRef.current === "listening") void mic.current?.flush();
  }, []);

  const stop = useCallback(() => {
    active.current = false;
    turn.current++;
    transcribeAbort.current?.abort();
    mic.current?.close();
    mic.current = null;
    stopServerSpeech();
    setInterim("");
    setUserSpeaking(false);
    audioLevelRef.current = -1;
    setVoiceState("idle");
    mutedRef.current = false;
    setMuted(false);
  }, [setVoiceState]);

  const setHandsFree = useCallback((value: boolean) => {
    handsFreeRef.current = value;
    setHandsFreeState(value);
    try {
      localStorage.setItem(HANDS_FREE_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!value && stateRef.current === "speaking") mic.current?.pause();
    if (value && stateRef.current === "speaking" && !mutedRef.current)
      mic.current?.watchForBargeIn();
  }, []);

  /** Speak a reply that came from typed input (no microphone involved). */
  const say = useCallback(
    (text: string) => {
      if (!isServerSpeechSupported() || mutedRef.current) return;
      const myTurn = ++turn.current;
      setVoiceState("speaking");
      speakServer(text, {
        onStart: () => {
          if (myTurn === turn.current && active.current && handsFreeRef.current)
            mic.current?.watchForBargeIn();
        },
        onEnd: () => {
          if (myTurn !== turn.current) return;
          if (active.current) listenNow();
          else setVoiceState("idle");
        },
        onError: (message) => {
          if (myTurn !== turn.current) return;
          setError(message || ERROR_TEXT.tts);
          setVoiceState("idle");
        },
      });
    },
    [listenNow, setVoiceState],
  );

  return {
    state,
    interim,
    error,
    supported,
    muted,
    userSpeaking,
    handsFree,
    setHandsFree,
    start,
    stop,
    interrupt,
    finishUtterance,
    toggleMute,
    say,
    clearError: () => setError(null),
    audioLevelRef,
  };
}
