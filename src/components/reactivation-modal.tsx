import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitRenewalPayment } from "@/lib/client-platform.functions";
import { paymentMethods, type Instance } from "@/lib/portal";
import { automations } from "@/lib/automations";

export function ReactivationModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const meta = automations.find((a) => a.slug === instance.automation_slug);
  const amount = meta?.price ?? 0;
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<string>(paymentMethods[1]);
  const [transaction, setTransaction] = useState("");
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await submitRenewalPayment({ data: { automationId: instance.id, paymentMethod: method, transactionId: transaction.trim(), senderName: sender.trim(), amount } });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not submit renewal payment.");
      return;
    }
    setBusy(false);
    await queryClient.invalidateQueries();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-destructive/40 bg-card p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-destructive/12">
            <CircleAlert className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold">Subscription expired</h2>
            <p className="text-sm text-muted-foreground">
              Your widget is offline on {instance.website_domain}. Submit your renewal payment reference.
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm">
          <p className="font-extrabold">Amount due: ${amount} USD</p>
          <p className="mt-1 text-muted-foreground">
            Send the transfer, then paste the transaction reference below. Verification usually takes under 15 minutes.
          </p>
        </div>
        <div className="mt-5 grid gap-4">
          <div>
            <Label>Payment method</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {paymentMethods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${method === m ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Transaction ID</Label>
            <Input
              value={transaction}
              onChange={(e) => setTransaction(e.target.value)}
              className="mt-2 h-12 rounded-xl"
              placeholder="TXN-884192"
            />
          </div>
          <div>
            <Label>Sender name</Label>
            <Input value={sender} onChange={(e) => setSender(e.target.value)} className="mt-2 h-12 rounded-xl" />
          </div>
        </div>
        {error && <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button disabled={busy || !transaction || !sender} onClick={submit}>
            {busy ? "Submitting…" : "Submit renewal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
