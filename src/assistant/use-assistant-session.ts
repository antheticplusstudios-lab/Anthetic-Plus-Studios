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
import { supabase } from "@/integrations/supabase/client";
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
  const activeRequest = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, updates: Partial<ChatEntry>) => {
    entriesRef.current = entriesRef.current.map((entry) => entry.id === id ? { ...entry, ...updates } : entry);
    setEntries(entriesRef.current);
  }, []);

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
      activeRequest.current?.abort();
      activeRequest.current = null;
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

  /**
   * Sends a message over the first-party SSE endpoint. User-visible deltas are emitted only
   * after the server's structured tool decision has resolved to tool:null.
   */
  const send = useCallback(
    async (
      raw: string,
      language?: { language?: string | null; confidence?: number },
      onDelta?: (delta: string) => void,
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

      activeRequest.current?.abort();
      const ctrl = new AbortController();
      activeRequest.current = ctrl;
      const gen = ++generation.current;
      setPending(null);
      setBusy(true);
      const history: ChatTurn[] = entriesRef.current
        .filter((entry) => !entry.isError)
        .slice(-MAX_HISTORY_TURNS)
        .map((entry) => ({ role: entry.role, content: entry.content }));
      push({ id: uid(), role: "user", content: text });

      const assistantId = uid();
      let partialEntry = false;
      let partialText = "";
      let finalResponse: AssistantResponse | null = null;

      const appendDelta = (delta: string) => {
        if (gen !== generation.current || ctrl.signal.aborted || !delta) return;
        if (!partialEntry) {
          partialEntry = true;
          push({ id: assistantId, role: "assistant", content: delta });
          partialText = delta;
        } else {
          partialText += delta;
          patch(assistantId, { content: partialText });
        }
        onDelta?.(delta);
      };

      try {
        const sessionData = user
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        if (gen !== generation.current || ctrl.signal.aborted) return null;
        const token = sessionData.data.session?.access_token;
        const response = await fetch("/api/public/assistant/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
          body: JSON.stringify({
            site: "antheticplus",
            message: text,
            history,
            ...(language?.language ? { language: language.language } : {}),
            ...(language?.confidence !== undefined ? { languageConfidence: language.confidence } : {}),
          }),
          signal: ctrl.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as
            | { error?: { message?: string } }
            | null;
          const message = payload?.error?.message || "I couldn't reach the assistant. Please try again.";
          finalResponse = {
            ok: false,
            error: { code: response.status === 401 ? "unauthenticated" : "network", message },
            requestId: "client",
          };
        } else if (!response.body) {
          finalResponse = {
            ok: false,
            error: { code: "network", message: "Your browser couldn't open the assistant stream. Please try again." },
            requestId: "client",
          };
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          const handleEvent = (block: string) => {
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
            }
            if (!dataLines.length) return;
            let payload: unknown;
            try {
              payload = JSON.parse(dataLines.join("\n"));
            } catch {
              return;
            }
            if (eventName === "delta") {
              const delta = (payload as { text?: unknown })?.text;
              if (typeof delta === "string") appendDelta(delta);
            } else if (eventName === "complete" || eventName === "error") {
              finalResponse = payload as AssistantResponse;
            }
          };

          while (true) {
            if (gen !== generation.current || ctrl.signal.aborted) {
              await reader.cancel().catch(() => undefined);
              return null;
            }
            const next = await reader.read();
            buffer += decoder.decode(next.value, { stream: !next.done });
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary).replace(/\r/g, "");
              buffer = buffer.slice(boundary + 2);
              handleEvent(block);
              boundary = buffer.indexOf("\n\n");
            }
            if (next.done) break;
          }
          if (buffer.trim()) handleEvent(buffer.replace(/\r/g, ""));
          if (!finalResponse) {
            finalResponse = {
              ok: false,
              error: { code: "network", message: "The assistant stream ended unexpectedly. Please try again." },
              requestId: "client",
            };
          }
        }

        if (gen !== generation.current || ctrl.signal.aborted || !finalResponse) return null;
        if (!finalResponse.ok) {
          if (partialEntry) {
            patch(assistantId, { content: finalResponse.error.message, isError: true, actions: undefined, pending: null });
          } else {
            push({ id: assistantId, role: "assistant", content: finalResponse.error.message, isError: true });
          }
          return finalResponse.error.message;
        }
        setPending(finalResponse.pending);
        if (partialEntry) {
          patch(assistantId, {
            content: finalResponse.reply,
            actions: finalResponse.actions,
            pending: finalResponse.pending,
            isError: false,
          });
        } else {
          push({
            id: assistantId,
            role: "assistant",
            content: finalResponse.reply,
            actions: finalResponse.actions,
            pending: finalResponse.pending,
          });
        }
        return finalResponse.reply;
      } catch (error) {
        if (gen !== generation.current || ctrl.signal.aborted) return null;
        const message = errorFromThrown(error);
        if (partialEntry) {
          patch(assistantId, { content: message, isError: true, actions: undefined, pending: null });
        } else {
          push({ id: assistantId, role: "assistant", content: message, isError: true });
        }
        return message;
      } finally {
        if (activeRequest.current === ctrl) activeRequest.current = null;
        if (gen === generation.current) setBusy(false);
      }
    },
    [pending, confirm, dismiss, push, patch, user],
  );

  const cancel = useCallback(() => {
    generation.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    generation.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    entriesRef.current = [];
    setEntries([]);
    setPending(null);
    setBusy(false);
  }, []);

  return { entries, busy, pending, send, confirm, dismiss, cancel, reset, signedIn: Boolean(user) };
}
