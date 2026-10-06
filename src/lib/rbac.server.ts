import type { AuthContext } from "@/integrations/supabase/auth-middleware";

export type RbacContext = Pick<AuthContext, "userId" | "tenant">;

export function assertTenantActive(ctx: RbacContext) {
  if (ctx.tenant.isBanned || ctx.tenant.isSuspended) {
    throw new Response("Forbidden: account restricted", { status: 403 });
  }
}

export function assertStaff(ctx: RbacContext) {
  if (!ctx.tenant.isStaff) throw new Response("Forbidden: staff access required", { status: 403 });
  if (ctx.tenant.isBanned || ctx.tenant.isSuspended)
    throw new Response("Forbidden: account restricted", { status: 403 });
}

export function assertAdmin(ctx: RbacContext) {
  assertStaff(ctx);
  if (!ctx.tenant.isPlatformAdmin)
    throw new Response("Forbidden: admin access required", { status: 403 });
}

export function assertOwner(ctx: RbacContext) {
  assertAdmin(ctx);
  if (!ctx.tenant.isSuperAdmin)
    throw new Response("Forbidden: owner-level access required", { status: 403 });
}
