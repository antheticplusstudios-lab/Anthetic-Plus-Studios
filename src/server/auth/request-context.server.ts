import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/server/auth/tenant.server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function createAuthClient(token: string): SupabaseClient<Database> {
  const url = required("DB1_URL");
  const key = process.env["DB1_ANON_KEY"] ?? process.env["DB1_PUBLISHABLE_KEY"];
  if (!key) throw new Error("Missing required server environment variable: DB1_ANON_KEY");
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the standard Supabase claims and tenant context for a direct HTTP request.
 * No bearer token means guest access. A supplied invalid token is never downgraded to guest.
 */
export async function authContextFromRequest(request: Request): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  if (!authHeader.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) throw new Response("Unauthorized", { status: 401 });

  const supabase = createAuthClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
  const claims = data.claims as Record<string, unknown>;
  const tenant = await resolveTenantContext(token, claims);
  return {
    supabase,
    userId: String(data.claims.sub),
    claims,
    tenant,
  };
}
