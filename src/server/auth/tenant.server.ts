import { getDb } from "@/server/db/clients.server";

export type TenantContext = {
  userId: string;
  organizationId: string;
  clientId: string;
  role: string;
  /** Role inside the active organization (organization_members.role). Never grants platform privileges. */
  orgRole: string;
  email: string;
  isStaff: boolean;
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
  isBanned: boolean;
  isSuspended: boolean;
  isMuted: boolean;
  roles: string[];
};

type Claims = Record<string, unknown>;

export async function resolveTenantContext(token: string, claims: Claims): Promise<TenantContext> {
  const userId = String(claims.sub ?? "");
  if (!userId) throw new Error("Unauthorized: no user id");

  const db1 = getDb("db1");
  const [profileRes, membershipRes, roleRes, restrictionRes] = await Promise.all([
    db1.from("profiles").select("id,email,default_organization_id").eq("id", userId).maybeSingle(),
    db1.from("organization_members").select("organization_id,role,is_active").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }),
    db1.from("user_roles").select("role").eq("user_id", userId),
    db1.from("account_restrictions").select("status,muted").eq("user_id", userId).maybeSingle(),
  ]);

  // Fail closed: a failed lookup must never silently downgrade or upgrade the caller.
  if (profileRes.error || membershipRes.error || roleRes.error || restrictionRes.error) {
    throw new Response("Unable to resolve account context", { status: 503 });
  }

  const profile = profileRes.data;
  const memberships = membershipRes.data ?? [];

  // PLATFORM roles come ONLY from user_roles. organization_members.role is an org-scoped role
  // (every self-signup is inserted as org 'owner' by handle_new_user) and must never be merged into
  // platform privileges, otherwise every customer would pass assertOwner/assertAdmin.
  const roles = new Set<string>(
    (roleRes.data ?? []).map((r: any) => String(r.role).trim().toLowerCase()).filter(Boolean),
  );

  // profiles.default_organization_id is user-writable under RLS (profiles_update), so it is only a
  // preference: honour it solely when the user has an ACTIVE membership in that organization.
  const preferred = profile?.default_organization_id ? String(profile.default_organization_id) : "";
  const membership =
    memberships.find((m: any) => String(m.organization_id) === preferred) ?? memberships[0] ?? null;
  const organizationId = String(membership?.organization_id ?? "");
  if (!organizationId) throw new Error("Account is missing an organization");
  const orgRole = String(membership?.role ?? "member").trim().toLowerCase();

  const restriction = restrictionRes.data ?? { status: "active", muted: false };

  const isSuperAdmin = roles.has("owner") || roles.has("admin");
  const isPlatformAdmin = isSuperAdmin || roles.has("partner");
  const isStaff = isPlatformAdmin || roles.has("verifier") || roles.has("staff");

  let primaryRole = "client";
  if (roles.has("owner")) primaryRole = "owner";
  else if (roles.has("admin")) primaryRole = "admin";
  else if (roles.has("partner")) primaryRole = "partner";
  else if (roles.has("verifier")) primaryRole = "verifier";
  else if (roles.has("staff")) primaryRole = "staff";

  return {
    userId,
    organizationId,
    clientId: organizationId,
    role: primaryRole,
    orgRole,
    email: String(profile?.email ?? claims.email ?? ""),
    isStaff,
    isPlatformAdmin,
    isSuperAdmin,
    isBanned: String(restriction.status) === "banned",
    isSuspended: String(restriction.status) === "suspended",
    isMuted: Boolean(restriction.muted),
    roles: Array.from(roles),
  };
}

export function assertTenantActive(ctx: TenantContext) {
  if (ctx.isBanned) throw new Response("Forbidden: account is banned", { status: 403 });
  if (ctx.isSuspended) throw new Response("Forbidden: account is suspended", { status: 403 });
}
