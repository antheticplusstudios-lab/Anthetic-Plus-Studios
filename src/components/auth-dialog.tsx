import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheckBig, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatePresence, motion } from "@/components/motion";
import { supabase } from "@/integrations/supabase/client";

function getAuthRedirectUrl() {
  // Production uses the canonical Vercel origin. Local development falls back
  // to the current browser origin when VITE_APP_URL is not configured.
  const configured = import.meta.env.VITE_APP_URL?.trim().replace(/\/$/, "");
  const origin = configured || window.location.origin;
  return `${origin}/auth/callback`;
}

export function AuthPanel({
  initialMode = "signin",
  onDone,
}: {
  initialMode?: "signin" | "signup";
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: getAuthRedirectUrl() },
          });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setSent(true);
      return;
    }
    await queryClient.invalidateQueries();
    onDone?.();
  };

  const oauth = async (provider: "google" | "discord") => {
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getAuthRedirectUrl() },
    });
    if (error) setMessage(error.message);
  };

  const google = () => oauth("google");
  const discord = () => oauth("discord");

  if (sent) {
    return (
      <div className="py-4 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/12"
        >
          <CircleCheckBig className="h-7 w-7 text-primary" />
        </motion.div>
        <h2 className="mt-5 text-xl font-extrabold">Confirm your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{email}</strong>. Open it, then sign in right here
          — you never have to leave this page.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setSent(false);
            setMode("signin");
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold tracking-tight">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "signin"
          ? "Pick up right where you left off."
          : "Takes a few seconds — you stay on this page the whole time."}
      </p>

      <div className="relative mt-5 grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-bold">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="relative z-10 rounded-full py-2 transition-colors"
          >
            {mode === m && (
              <motion.span
                layoutId="auth-pill"
                className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className={mode === m ? "text-foreground" : "text-muted-foreground"}>
              {m === "signin" ? "Sign in" : "Sign up"}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="outline" className="w-full" onClick={google} type="button">
          <span className="text-lg font-extrabold text-primary">G</span>
          Google
        </Button>
        <Button variant="outline" className="w-full" onClick={discord} type="button">
          <span className="text-sm font-black">Discord</span>
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="auth-email">Email address</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-2 h-12 rounded-xl"
          />
        </div>
        <div>
          <Label htmlFor="auth-password">Password</Label>
          <div className="relative mt-2">
            <Input
              id="auth-password"
              type={show ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="h-12 rounded-xl pr-12"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {message && (
            <motion.p
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {message}
            </motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}

export function AuthDialog({
  children,
  mode = "signin",
  to,
}: {
  children: ReactNode;
  mode?: "signin" | "signup";
  to?: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
        <AuthPanel
          initialMode={mode}
          onDone={() => {
            setOpen(false);
            if (to) void navigate({ to });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
