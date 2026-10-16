/** Explicit, tenant-scoped receptionist booking action. Never creates an appointment from AI output alone. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  automationId: z.string().uuid(),
  service: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  visitorName: z.string().trim().min(2).max(160),
  visitorPhone: z.string().trim().min(5).max(50),
  visitorEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const createServiceBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { db2Admin, db4Admin } = await import("@/server/db/clients.server");
    const { assertTenantActive } = await import("@/lib/rbac.server");
    assertTenantActive(context as never);
    const tenantId = context.tenant.clientId;
    if (!tenantId) throw new Error("A client workspace is required to create a booking.");

    const { data: automation, error } = await db2Admin
      .from("client_automations")
      .select(
        "id,client_id,automation_type,product_type,config,status,run_state,enabled,is_active,expires_at",
      )
      .eq("id", data.automationId)
      .maybeSingle();
    if (error) throw new Error("Could not load the receptionist configuration.");
    if (!automation || String(automation.client_id) !== tenantId)
      throw new Error("Receptionist not found.");
    const kind = String(automation.automation_type ?? automation.product_type ?? "");
    if (!new Set(["ai_receptionist", "voice-sms-receptionist"]).has(kind))
      throw new Error("Bookings are only available for the AI Receptionist.");
    if (
      automation.enabled === false ||
      automation.is_active === false ||
      automation.status === "disabled" ||
      automation.run_state === "paused"
    )
      throw new Error("Enable the receptionist before creating bookings.");

    const config = (automation.config ?? {}) as Record<string, unknown>;
    const settings = (config["settings"] ?? {}) as Record<string, unknown>;
    const services = String(settings["services"] ?? "")
      .split(/\r?\n/)
      .map((s) => s.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter(Boolean);
    const matchedService = services.find((s) => s.toLowerCase() === data.service.toLowerCase());
    if (!matchedService)
      throw new Error("This service is not in the client's configured service list.");

    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);
    const now = Date.now();
    const duration = end.getTime() - start.getTime();
    if (start.getTime() < now + 2 * 60_000)
      throw new Error("Choose a future start time at least two minutes from now.");
    if (duration < 5 * 60_000 || duration > 8 * 60 * 60_000)
      throw new Error("Booking duration must be between 5 minutes and 8 hours.");

    // Prevent common duplicate submissions before querying/creating the external event.
    const { data: existing, error: duplicateError } = await db4Admin
      .from("appointments")
      .select("id,status")
      .eq("automation_id", data.automationId)
      .eq("visitor_phone", data.visitorPhone)
      .eq("starts_at", start.toISOString())
      .in("status", ["booked", "rescheduled"])
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw new Error("Could not verify duplicate bookings.");
    if (existing) throw new Error("A booking already exists for this caller at that time.");

    const { findCalendarAvailability, createCalendarEvent } =
      await import("@/lib/integration-delivery.server");
    const availability = await findCalendarAvailability({
      automationId: data.automationId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    });
    const calendars = (availability["calendars"] ?? {}) as Record<string, unknown>;
    const busy = Object.values(calendars).flatMap((calendar) => {
      const rows = (calendar as { busy?: unknown[] } | null)?.busy;
      return Array.isArray(rows) ? rows : [];
    });
    if (busy.length) throw new Error("That time is no longer available. Check another slot.");

    const { data: conflict, error: conflictError } = await db4Admin
      .from("appointments")
      .select("id")
      .eq("automation_id", data.automationId)
      .in("status", ["booked", "rescheduled"])
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1)
      .maybeSingle();
    if (conflictError) throw new Error("Could not check existing appointment conflicts.");
    if (conflict) throw new Error("That time overlaps another appointment in the booking records.");

    const visitorEmail = data.visitorEmail || "";
    const summary = `${matchedService} — ${data.visitorName}`;
    const event = await createCalendarEvent({
      automationId: data.automationId,
      start: start.toISOString(),
      end: end.toISOString(),
      summary,
      description: [
        `Service: ${matchedService}`,
        `Customer: ${data.visitorName}`,
        `Phone: ${data.visitorPhone}`,
        visitorEmail ? `Email: ${visitorEmail}` : "",
        data.location ? `Location: ${data.location}` : "",
        data.notes ? `Notes: ${data.notes}` : "",
        `Created by user ${context.userId}`,
      ]
        .filter(Boolean)
        .join("\n"),
      ...(visitorEmail ? { attendeeEmail: visitorEmail } : {}),
    });

    const { data: appointment, error: insertError } = await db4Admin
      .from("appointments")
      .insert({
        client_id: tenantId,
        automation_id: data.automationId,
        conversation_id: null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        timezone: "UTC",
        status: "booked",
        visitor_name: data.visitorName,
        visitor_email: visitorEmail,
        visitor_phone: data.visitorPhone,
        notes: [
          `Service: ${matchedService}`,
          data.location ? `Location: ${data.location}` : "",
          data.notes ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
        external_ref: event.id || null,
      })
      .select("id")
      .single();
    if (insertError) {
      // The calendar event already exists. Surface this as a reconciliation issue, never a success.
      console.error("Calendar event created but appointment persistence failed", {
        automationId: data.automationId,
        eventId: event.id,
        error: insertError.message,
      });
      throw new Error(
        "The calendar event was created, but the booking record could not be saved. Contact support before retrying.",
      );
    }

    return {
      ok: true as const,
      appointmentId: appointment.id,
      service: matchedService,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      calendarEventId: event.id,
      calendarLink: event.htmlLink,
    };
  });
