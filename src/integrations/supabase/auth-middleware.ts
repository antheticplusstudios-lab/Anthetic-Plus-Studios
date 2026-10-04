import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveTenantContext, type TenantContext } from "@/server/auth/tenant.server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function createAuthClient(token: string): SupabaseClient<Database> {
  const url = required("DB1_URL");
  const key = process.env.DB1_ANON_KEY ?? process.env.DB1_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing required server environment variable: DB1_ANON_KEY");
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
  tenant: TenantContext;
};

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) throw new Response("Unauthorized", { status: 401 });

  const supabase = createAuthClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Response("Unauthorized", { status: 401 });

  const claims = data.claims as Record<string, unknown>;
  const tenant = await resolveTenantContext(token, claims);
  return next({
    context: {
      supabase,
      userId: String(data.claims.sub),
      claims,
      tenant,
    } satisfies AuthContext,
  });
});
