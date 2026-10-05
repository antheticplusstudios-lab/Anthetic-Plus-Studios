import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { testReceptionist } from "@/lib/improvements.functions";

type Msg = { role: "user" | "assistant"; content: string };

export function TestChatPanel({ automationId, disabled }: { automationId: string; disabled?: boolean }) {
  const ask = useServerFn(testReceptionist);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, busy]);

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setErr("");
    const history = msgs;
    setMsgs([...history, { role: "user", content: message }]);
    setBusy(true);
    try {
      const r = await ask({ data: { automationId, message, history } });
      if ("error" in r && r.error) setErr(r.error);
      else if ("reply" in r) setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const starters = ["What services do you offer?", "What are your opening hours?", "How do I book an appointment?"];

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold">Test your receptionist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chat with your assistant before adding it to your site. Test chats aren't saved or counted.
          </p>
        </div>
        {msgs.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setMsgs([]); setErr(""); }}>
            <RotateCcw /> Reset
          </Button>
        )}
      </div>

      <div className="mt-5 flex h-80 flex-col gap-3 overflow-y-auto rounded-2xl bg-muted/50 p-4">
        {msgs.length === 0 && !busy && (
          <div className="m-auto text-center">
            <Bot className="mx-auto h-9 w-9 text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Ask anything a visitor might ask.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  disabled={disabled}
                  onClick={() => setText(s)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold hover:border-primary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
              m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-background"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl bg-background px-4 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Typing…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {err && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? "Available once your automation is active" : "Type a message…"}
          disabled={disabled || busy}
          maxLength={2000}
        />
        <Button type="submit" disabled={disabled || busy || !text.trim()}>
          <Send /> Send
        </Button>
      </form>
    </section>
  );
}
