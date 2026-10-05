// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

type Rows = Record<string, { data: unknown; error: null | { message: string } }>;
let rows: Rows;

vi.mock("@/server/db/clients.server", () => ({
  getDb: () => ({
    from: (table: string) => {
      const result = () => rows[table] ?? { data: null, error: null };
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return chain;
    },
  }),
}));

import { resolveTenantContext } from "./tenant.server";

const USER = "11111111-1111-1111-1111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ok = (data: unknown) => ({ data, error: null });

beforeEach(() => {
  rows = {
    profiles: ok({ id: USER, email: "u@example.com", default_organization_id: ORG_A }),
    organization_members: ok([{ organization_id: ORG_A, role: "owner", is_active: true }]),
    user_roles: ok([{ role: "client" }]),
    account_restrictions: ok({ status: "active", muted: false }),
  };
});

describe("resolveTenantContext", () => {
  it("does NOT grant platform privileges to an organization 'owner'/'admin' (every self-signup is an org owner)", async () => {
    const ctx = await resolveTenantContext("t", { sub: USER });
    expect(ctx.orgRole).toBe("owner");
    expect(ctx.isSuperAdmin).toBe(false);
    expect(ctx.isPlatformAdmin).toBe(false);
    expect(ctx.isStaff).toBe(false);
    expect(ctx.roles).toEqual(["client"]);
  });

  it("grants platform privileges only from user_roles", async () => {
    rows.user_roles = ok([{ role: "client" }, { role: "admin" }]);
    const ctx = await resolveTenantContext("t", { sub: USER });
    expect(ctx.isSuperAdmin).toBe(true);
    expect(ctx.role).toBe("admin");
  });

  it("ignores a user-writable default_organization_id that has no active membership", async () => {
    rows.profiles = ok({ id: USER, email: "u@example.com", default_organization_id: ORG_B });
    const ctx = await resolveTenantContext("t", { sub: USER });
    expect(ctx.organizationId).toBe(ORG_A);
  });

  it("honours default_organization_id when the user is an active member of it", async () => {
    rows.profiles = ok({ id: USER, email: "u@example.com", default_organization_id: ORG_B });
    rows.organization_members = ok([
      { organization_id: ORG_A, role: "owner", is_active: true },
      { organization_id: ORG_B, role: "member", is_active: true },
    ]);
    const ctx = await resolveTenantContext("t", { sub: USER });
    expect(ctx.organizationId).toBe(ORG_B);
    expect(ctx.orgRole).toBe("member");
  });

  it("fails closed when a lookup errors", async () => {
    rows.user_roles = { data: null, error: { message: "boom" } };
    await expect(resolveTenantContext("t", { sub: USER })).rejects.toBeInstanceOf(Response);
  });

  it("rejects an account with no active membership", async () => {
    rows.organization_members = ok([]);
    await expect(resolveTenantContext("t", { sub: USER })).rejects.toThrow(/missing an organization/);
  });
});
