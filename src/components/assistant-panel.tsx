import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "@/components/motion";
import { useAskAssistant, useAssistantStatus } from "@/hooks/use-assistant";

const suggestions = [
  "Which payments are still waiting on me?",
  "What is our MRR right now and where is it at risk?",
  "Which automations expire in the next week?",
  "Anything unusual in the last 24 hours?",
];

/** Owner/Partner copilot: asks about live orders, subscriptions and automations. */
export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; model: string } | null>(null);
  const { data: status } = useAssistantStatus();
  const ask = useAskAssistant();

  const askNow = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 3) return;
    setAnswer(null);
    ask.mutate(trimmed, {
      onSuccess: (result) => setAnswer({ text: result.answer, model: result.model }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden gap-2 sm:inline-flex">
          <Sparkles className="h-4 w-4 text-primary" />
          Ask AI
          {!status?.configured && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Operations assistant
          </DialogTitle>
          <DialogDescription>
            Ask about orders, subscriptions and automations. It reads live records, never guesses.
          </DialogDescription>
        </DialogHeader>

        {!status?.configured ? (
          <div className="rounded-2xl border border-foreground/30 bg-foreground/10 p-4">
            <p className="text-sm font-semibold text-foreground">No OpenRouter key yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste your key on the Infrastructure page and the assistant goes live for owners and partners.
            </p>
            <Button size="sm" className="mt-3" asChild onClick={() => setOpen(false)}>
              <Link to="/admin/infrastructure">Open Infrastructure</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  askNow(question);
                }
              }}
              placeholder="e.g. Who hasn't paid this week and what should I chase first?"
              rows={3}
              className="resize-none rounded-2xl"
            />
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setQuestion(item);
                    askNow(item);
                  }}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {item}
                </button>
              ))}
            </div>
            <Button onClick={() => askNow(question)} disabled={ask.isPending || question.trim().length < 3} className="w-full">
              {ask.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {ask.isPending ? "Reading your records" : "Ask"}
            </Button>

            {ask.error && (
              <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{ask.error.message}</p>
            )}

            {answer && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 0.9, 0.2, 1] }}
                className="rounded-2xl border border-border bg-muted/30 p-4"
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer.text}</p>
                <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">via {answer.model}</p>
              </motion.div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
