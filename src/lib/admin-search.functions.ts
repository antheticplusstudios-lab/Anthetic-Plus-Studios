import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { db1Admin, db2Admin, db4Admin } from "@/server/db/clients.server";

const Query = z.object({ q: z.string().trim().min(2).max(160) });

// Owner search is platform-wide. Partner search is deliberately scoped to the
// partner's own origin domain/client IDs before conversation/order results are returned.
export const globalAdminSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Query.parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const needle = data.q.toLowerCase();
    const isOwner = !!context.tenant.isSuperAdmin;

    const { data: actorOrg } = await db1Admin
      .from("organizations")
      .select("id,origin_domain")
      .eq("id", context.tenant.organizationId)
      .maybeSingle();
    const myDomain = String(actorOrg?.origin_domain ?? "").toLowerCase();

    const [profilesRes, rolesRes, autosRes, ordersRes] = await Promise.all([
      db1Admin.from("profiles").select("user_id,client_id,default_organization_id,full_name,company_name,company_email,website_url,registered_origin_domain"),
      db1Admin.from("user_roles").select("user_id,role"),
      db2Admin.from("client_automations").select("id,client_id,order_id,automation_type,name,domain_url,origin_domain,run_state,is_active,expires_at,requires_reinstallation,created_at,last_seen_at").limit(1000),
      db2Admin.from("orders").select(ORDER_SELECT as "*").order("created_at", { ascending: false }).limit(1000),
    ]);
    for (const r of [profilesRes, rolesRes, autosRes, ordersRes]) if (r.error) throw new Error(r.error.message);

    const profiles = profilesRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const autos = (autosRes.data ?? []).filter((a) => {
      if (isOwner) return true;
      return String(a.origin_domain ?? "").toLowerCase() === myDomain || String(a.client_id ?? "") === String(context.tenant.clientId ?? "");
    });
    const allowedClientIds = new Set(autos.map((a) => String(a.client_id)));
    if (context.tenant.clientId) allowedClientIds.add(String(context.tenant.clientId));

    const roleMap = new Map<string, string[]>();
    for (const r of roles) roleMap.set(String(r.user_id), [...(roleMap.get(String(r.user_id)) ?? []), String(r.role)]);

    const userMatches = profiles
      .filter((p) => isOwner || allowedClientIds.has(String(p.client_id ?? p.default_organization_id ?? "")) || String(p.registered_origin_domain ?? "").toLowerCase() === myDomain)
      .filter((p) => `${p.user_id} ${p.client_id} ${p.full_name ?? ""} ${p.company_name ?? ""} ${p.company_email ?? ""} ${p.website_url ?? ""} ${p.registered_origin_domain ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((p) => ({
        id: String(p.user_id),
        clientId: String(p.client_id ?? p.default_organization_id ?? ""),
        name: String(p.full_name ?? ""),
        company: String(p.company_name ?? ""),
        email: String(p.company_email ?? ""),
        originDomain: String(p.registered_origin_domain ?? ""),
        roles: roleMap.get(String(p.user_id)) ?? [],
      }));

    const automationMatches = autos
      .filter((a) => `${a.id} ${a.client_id} ${a.name ?? ""} ${a.automation_type ?? ""} ${a.domain_url ?? ""} ${a.origin_domain ?? ""} ${a.run_state ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((a) => ({
        id: String(a.id),
        clientId: String(a.client_id),
        name: String(a.name ?? ""),
        type: String(a.automation_type ?? ""),
        domain: String(a.domain_url ?? ""),
        state: String(a.run_state ?? ""),
        active: !!a.is_active,
        expiresAt: a.expires_at as string | null,
        reinstall: !!a.requires_reinstallation,
        lastSeenAt: a.last_seen_at as string | null,
      }));

    const orderMatches = (ordersRes.data ?? [])
      .filter((o) => isOwner || allowedClientIds.has(String(o.client_id)))
      .filter((o) => `${o.id} ${o.order_id ?? ""} ${o.client_id} ${o.automation_type ?? ""} ${o.status ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 10)
      .map((o) => ({
        id: String(o.id),
        orderId: String(o.order_id ?? o.id),
        clientId: String(o.client_id),
        type: String(o.automation_type ?? ""),
        status: String(o.status ?? ""),
        amount: Number(o.total_amount ?? 0),
        createdAt: o.created_at as string,
      }));

    const autoIds = autos.map((a) => String(a.id));
    const conversationRows = autoIds.length
      ? (await db4Admin.from("conversations").select("id,automation_id,client_id,channel,status,customer_phone_or_id,origin,last_message_at,created_at,summary").in("automation_id", autoIds).order("last_message_at", { ascending: false }).limit(1000)).data ?? []
      : [];
    const conversations = conversationRows
      .filter((c) => isOwner || allowedClientIds.has(String(c.client_id)))
      .filter((c) => `${c.id} ${c.automation_id} ${c.client_id} ${c.channel} ${c.status} ${c.customer_phone_or_id ?? ""} ${c.origin ?? ""} ${c.summary ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((c) => ({
        id: String(c.id),
        automationId: String(c.automation_id),
        clientId: String(c.client_id),
        channel: String(c.channel),
        status: String(c.status),
        customer: String(c.customer_phone_or_id ?? ""),
        origin: String(c.origin ?? ""),
        lastMessageAt: c.last_message_at as string,
        createdAt: c.created_at as string,
      }));

    // Keep this object intentionally small: global search is a navigation index,
    // not a data export endpoint. The full records stay behind their existing pages.
    return { users: userMatches, automations: automationMatches, orders: orderMatches, conversations };
  });
