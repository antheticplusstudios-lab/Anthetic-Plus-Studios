/**
 * Client conversation state for the unified assistant. Used by BOTH the text
 * chat and the voice loop, so they hit the same server brain and render the
 * same authoritative tool outcomes.
 */
import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  askAssistantGuest,
  askAssistantUser,
  confirmAssistantAction,
} from "@/lib/assistant-agent.functions";
import { useCurrentUser } from "@/hooks/use-portal";
import type { AssistantResponse, ChatTurn, PendingAction, ToolOutcome } from "./assistant.types";
import { MAX_HISTORY_TURNS, MAX_MESSAGE_LENGTH } from "./assistant.types";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ToolOutcome[];
  pending?: PendingAction | null;
  isError?: boolean;
};

const YES =
  /^(yes|yeah|yep|yup|sure|ok(ay)?|send( it)?|confirm|go ahead|do it|please do|please send|sí|si|oui|ja|हाँ|हां|জি|হ্যাঁ|ঠিক আছে|করুন|পাঠান)\b/i;
const NO =
  /^(no|nope|cancel|don'?t|do not|never ?mind|stop|no gracias|non|nein|नहीं|नही|না|বাদ দিন|বাতিল)\b/i;

function uid() {
  return Math.random().toString(36).slice(2);
}

function errorFromThrown(e: unknown): string {
  if (e instanceof Response) {
    if (e.status === 401) return "Your session has expired. Please sign in again.";
    if (e.status === 403) return "Your account doesn't have permission for that.";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You appear to be offline. Check your connection and try again.";
  return "I couldn't reach the assistant. Please try again.";
}

export function useAssistantSession() {
  const { data: user } = useCurrentUser();
  const guestAsk = useServerFn(askAssistantGuest);
  const userAsk = useServerFn(askAssistantUser);
  const confirmFn = useServerFn(confirmAssistantAction);

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const entriesRef = useRef<ChatEntry[]>([]);
  const generation = useRef(0);

  const push = useCallback((e: ChatEntry) => {
    entriesRef.current = [...entriesRef.current, e];
    setEntries(entriesRef.current);
  }, []);

  const apply = useCallback(
    (res: AssistantResponse): string => {
      if (!res.ok) {
        push({ id: uid(), role: "assistant", content: res.error.message, isError: true });
        return res.error.message;
      }
      setPending(res.pending);
      push({
        id: uid(),
        role: "assistant",
        content: res.reply,
        actions: res.actions,
        pending: res.pending,
      });
      return res.reply;
    },
    [push],
  );

  const run = useCallback(
    async (fn: () => Promise<AssistantResponse>): Promise<string | null> => {
      const gen = ++generation.current;
      setBusy(true);
      try {
        const res = await fn();
        if (gen !== generation.current) return null; // cancelled
        return apply(res);
      } catch (e) {
        if (gen !== generation.current) return null;
        const msg = errorFromThrown(e);
        push({ id: uid(), role: "assistant", content: msg, isError: true });
        return msg;
      } finally {
        if (gen === generation.current) setBusy(false);
      }
    },
    [apply, push],
  );

  const confirm = useCallback(async () => {
    if (!pending) return null;
    const token = pending.token;
    setPending(null);
    return run(() => confirmFn({ data: { token } }));
  }, [pending, run, confirmFn]);

  const dismiss = useCallback(() => {
    if (!pending) return null;
    setPending(null);
    const msg = "Okay, I won't do that.";
    push({ id: uid(), role: "assistant", content: msg });
    return msg;
  }, [pending, push]);

  /** Sends a message. Returns the assistant's reply text (for speech), or null if cancelled. */
  const send = useCallback(
    async (
      raw: string,
      language?: { language?: string | null; confidence?: number },
    ): Promise<string | null> => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text) return null;
      if (pending && YES.test(text)) {
        push({ id: uid(), role: "user", content: text });
        return confirm();
      }
      if (pending && NO.test(text)) {
        push({ id: uid(), role: "user", content: text });
        return dismiss();
      }
      setPending(null);
      const history: ChatTurn[] = entriesRef.current
        .filter((e) => !e.isError)
        .slice(-MAX_HISTORY_TURNS)
        .map((e) => ({ role: e.role, content: e.content }));
      push({ id: uid(), role: "user", content: text });
      return run(() =>
        user
          ? userAsk({
              data: {
                message: text,
                history,
                language: language?.language ?? undefined,
                languageConfidence: language?.confidence ?? undefined,
              },
            })
          : guestAsk({
              data: {
                message: text,
                history,
                language: language?.language ?? undefined,
                languageConfidence: language?.confidence ?? undefined,
              },
            }),
      );
    },
    [pending, confirm, dismiss, push, run, user, userAsk, guestAsk],
  );

  const cancel = useCallback(() => {
    generation.current++;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    generation.current++;
    entriesRef.current = [];
    setEntries([]);
    setPending(null);
    setBusy(false);
  }, []);

  return { entries, busy, pending, send, confirm, dismiss, cancel, reset, signedIn: Boolean(user) };
}
