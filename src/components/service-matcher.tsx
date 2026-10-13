import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarCheck, CheckCircle2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { matchServiceRequest } from "@/lib/service-match.functions";
import { createServiceBooking } from "@/lib/service-booking.functions";
import { Input } from "@/components/ui/input";

export function ServiceMatcher({
  automationId,
  disabled,
}: {
  automationId: string;
  disabled?: boolean;
}) {
  const run = useServerFn(matchServiceRequest);
  const book = useServerFn(createServiceBooking);
  const [text, setText] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const m = useMutation({
    mutationFn: () => run({ data: { automationId, description: text } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't match a service."),
  });
  const res = m.data;
  const d = res?.status === "ok" ? res.draft : null;
  const booking = useMutation({
    mutationFn: async () => {
      if (!d?.readyToBook || !d.service)
        throw new Error("Match a configured service and provide a date and time first.");
      if (!confirmed) throw new Error("Confirm that the caller approved this booking.");
      if (!bookingDate || !bookingTime)
        throw new Error("Choose the confirmed booking date and time.");
      const start = new Date(`${bookingDate}T${bookingTime}`);
      if (Number.isNaN(start.getTime())) throw new Error("Choose a valid date and time.");
      return book({
        data: {
          automationId,
          service: d.service,
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
          visitorName,
          visitorPhone,
          visitorEmail,
          location,
          notes,
        },
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Booking could not be created."),
    onSuccess: () => toast.success("Booking confirmed and saved."),
  });

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Find the right service for a caller</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Type what a caller asked for. We'll match it to one of your listed services and prepare the
        booking details. Nothing is booked until you or the receptionist confirm.
      </p>
      <Textarea
        className="mt-4"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled || m.isPending}
        placeholder="e.g. My AC is blowing warm air, can someone come Thursday afternoon? It's a 2-bedroom flat."
      />
      <div className="mt-3 flex justify-end">
        <Button
          className="rounded-full"
          onClick={() => m.mutate()}
          disabled={disabled || m.isPending || text.trim().length < 5}
        >
          {m.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {m.isPending ? "Matching…" : "Match service"}
        </Button>
      </div>

      {res?.status === "not_configured" && (
        <p className="mt-4 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
          Add your services (one per line) in this automation's settings first — we only match to
          services you offer.
        </p>
      )}
      {res?.status === "ai_unavailable" && (
        <p className="mt-4 rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">
          No AI provider is available right now. Please try again shortly.
        </p>
      )}
      {d && (
        <div className="mt-5 space-y-4 rounded-2xl border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-bold">{d.service ?? "No matching service"}</p>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold capitalize">
              {d.readyToBook ? "Ready to book" : `${d.confidence} match`}
            </span>
          </div>
          {d.reason && <p className="text-sm text-muted-foreground">{d.reason}</p>}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(
              [
                ["Date", d.details.preferredDate],
                ["Time", d.details.preferredTime],
                ["People", d.details.people],
                ["Location", d.details.location],
                ["Notes", d.details.notes],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-bold uppercase text-muted-foreground">{k}</dt>
                <dd>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {d.missing.length > 0 && (
            <p className="text-sm">
              <span className="font-bold">Still needed:</span> {d.missing.join(", ")}
            </p>
          )}
          {d.questions.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {d.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          {d.alternatives.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Also possible: {d.alternatives.join(", ")}
            </p>
          )}
          {d.readyToBook && (
            <div className="mt-5 space-y-4 border-t border-border pt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <CalendarCheck className="h-4 w-4" /> Service, date and time are identified.
                Complete the fields below and obtain the caller's explicit confirmation before
                creating the booking.
              </p>
              {booking.data?.ok ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4" /> Booking created
                  </p>
                  <p className="mt-1">
                    {booking.data.service} · {new Date(booking.data.startsAt).toLocaleString()}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Reference: {booking.data.appointmentId}
                  </p>
                  {booking.data.calendarLink && (
                    <a
                      className="mt-2 inline-block underline"
                      href={booking.data.calendarLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open calendar event
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Confirmed date</span>
                      <Input
                        type="date"
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                        disabled={booking.isPending}
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Confirmed start time</span>
                      <Input
                        type="time"
                        value={bookingTime}
                        onChange={(e) => setBookingTime(e.target.value)}
                        disabled={booking.isPending}
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Customer name</span>
                      <Input
                        value={visitorName}
                        onChange={(e) => setVisitorName(e.target.value)}
                        placeholder="Full name"
                        disabled={booking.isPending}
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Customer phone</span>
                      <Input
                        value={visitorPhone}
                        onChange={(e) => setVisitorPhone(e.target.value)}
                        placeholder="+880…"
                        disabled={booking.isPending}
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Email (optional)</span>
                      <Input
                        type="email"
                        value={visitorEmail}
                        onChange={(e) => setVisitorEmail(e.target.value)}
                        placeholder="customer@example.com"
                        disabled={booking.isPending}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Service location (optional)</span>
                      <Input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Address or online"
                        disabled={booking.isPending}
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium">Booking notes (optional)</span>
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Access details or caller requirements"
                      disabled={booking.isPending}
                    />
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      disabled={booking.isPending}
                    />
                    <span>
                      I confirm the caller has agreed to this service, date and time. I understand
                      this action creates a real calendar event and appointment record.
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-md text-xs text-muted-foreground">
                      Requires a connected Google Calendar. Availability is checked again on the
                      server immediately before booking.
                    </p>
                    <Button
                      className="rounded-full"
                      onClick={() => booking.mutate()}
                      disabled={
                        disabled ||
                        booking.isPending ||
                        !confirmed ||
                        !bookingDate ||
                        !bookingTime ||
                        visitorName.trim().length < 2 ||
                        visitorPhone.trim().length < 5
                      }
                    >
                      {booking.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarCheck className="h-4 w-4" />
                      )}
                      {booking.isPending ? "Checking and booking…" : "Confirm & book"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
