/** Admin RPCs: user management (ban/mute/badges), contact inbox, and Markdown email campaigns. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { markdownToEmailHtml } from "@/lib/markdown-email";
import { platformOfDomain, type Platform } from "@/lib/platforms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

async function dbs() {
  const { getDb } = await import("@/server/db/clients.server");
  return { db1: getDb("db1") as Loose, db2: getDb("db2") as Loose };
}

export type AdminUserRow = {
  userId: string;
  clientId: string;
  name: string;
  email: string;
  company: string;
  website: string;
  signupDomain: string;
  platform: Platform;
  bannedAt: string | null;
  mutedUntil: string | null;
  createdAt: string;
  lastSignIn: string | null;
  providers: string[];
  automations: {
    id: string;
    type: string;
    active: boolean;
    state: string;
    orderedOn: string;
    runningOn: string;
  }[];
};

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[]; error?: string }> => {
    assertAdmin(context);
    try {
      const { db1, db2 } = await dbs();
      const [{ data: profiles, error }, authRes, autoRes] = await Promise.all([
        db1.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000),
        db1.auth.admin.listUsers({ perPage: 1000 }),
        db2
          .from("client_automations")
          .select(
            "id,client_id,automation_type,is_active,run_state,origin_domain,domain_url,last_seen_origin",
          )
          .limit(5000),
      ]);
      if (error) throw new Error(error.message);
      const authById = new Map<string, Loose>(
        (authRes?.data?.users ?? []).map((u: Loose) => [u.id, u]),
      );
      const autos = new Map<string, AdminUserRow["automations"]>();
      for (const a of autoRes?.data ?? []) {
        const list = autos.get(a.client_id) ?? [];
        list.push({
          id: a.id,
          type: a.automation_type,
          active: a.is_active,
          state: a.run_state,
          orderedOn: a.ordered_on_domain || a.origin_domain || "",
          runningOn: a.running_on_domain || a.last_seen_origin || a.domain_url || "",
        });
        autos.set(a.client_id, list);
      }
      const users = (profiles ?? []).map((p: Loose): AdminUserRow => {
        const au = authById.get(p.user_id);
        const signup = p.signup_domain || p.registered_origin_domain || "";
        return {
          userId: p.user_id,
          clientId: p.client_id,
          name: p.full_name || "",
          email: au?.email || p.company_email || "",
          company: p.company_name || "",
          website: p.website_url || "",
          signupDomain: signup,
          platform: platformOfDomain(signup),
          bannedAt: p.banned_at ?? null,
          mutedUntil: p.muted_until ?? null,
          createdAt: p.created_at,
          lastSignIn: au?.last_sign_in_at ?? null,
          providers: (au?.identities ?? []).map((i: Loose) => i.provider),
          automations: autos.get(p.client_id) ?? autos.get(p.user_id) ?? [],
        };
      });
      return { users };
    } catch (e) {
      return { users: [], error: (e as Error).message };
    }
  });

export const adminModerateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        action: z.enum(["ban", "unban", "mute", "unmute"]),
        muteHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 365)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You can't moderate your own account");
    const { db1 } = await dbs();
    const patch: Record<string, unknown> = {};
    if (data.action === "ban") patch["banned_at"] = new Date().toISOString();
    if (data.action === "unban") patch["banned_at"] = null;
    if (data.action === "mute")
      patch["muted_until"] = new Date(Date.now() + (data.muteHours ?? 24) * 3600_000).toISOString();
    if (data.action === "unmute") patch["muted_until"] = null;
    const { error } = await db1.from("profiles").update(patch).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    if (data.action === "ban" || data.action === "unban") {
      await db1.auth.admin
        .updateUserById(data.userId, { ban_duration: data.action === "ban" ? "876000h" : "none" })
        .catch(() => undefined);
    }
    return { ok: true };
  });

export const adminListContactMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    try {
      const { db1 } = await dbs();
      const { data, error } = await db1
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return { messages: (data ?? []) as Loose[], error: undefined as string | undefined };
    } catch (e) {
      return { messages: [] as Loose[], error: (e as Error).message };
    }
  });

export const adminListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    try {
      const { db1 } = await dbs();
      const { data } = await db1
        .from("email_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return { campaigns: (data ?? []) as Loose[] };
    } catch {
      return { campaigns: [] as Loose[] };
    }
  });

export const adminSendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        platform: z.enum(["antheticplus", "autumic", "both"]),
        subject: z.string().trim().min(1).max(200),
        markdown: z.string().trim().min(1).max(50_000),
        recipients: z.array(z.string().email()).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (!data.recipients.length) throw new Error("Pick at least one user");
    const { sendEmail } = await import("@/assistant/email.server");
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px">${markdownToEmailHtml(data.markdown)}</div>`;
    let sent = 0;
    let lastError = "";
    for (const to of [...new Set(data.recipients)]) {
      try {
        await sendEmail({ to, subject: data.subject, text: data.markdown, html });
        sent++;
      } catch (e) {
        lastError = (e as Error).message;
        if ((e as Error).name === "EmailNotConfiguredError") break;
      }
    }
    try {
      const { db1 } = await dbs();
      await db1.from("email_campaigns").insert({
        platform: data.platform,
        subject: data.subject,
        body_markdown: data.markdown,
        recipients: data.recipients.length,
        sent,
        created_by: context.userId,
      });
    } catch (e) {
      console.error("campaign log failed", e);
    }
    return {
      sent,
      total: data.recipients.length,
      error: sent < data.recipients.length ? lastError : "",
    };
  });
