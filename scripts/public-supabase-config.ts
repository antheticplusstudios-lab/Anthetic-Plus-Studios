/**
 * Resolve only the public DB1 configuration that is allowed in browser bundles.
 * Service-role/secret keys must never be mapped to VITE_* variables.
 */
export type EnvironmentValues = Record<string, string | undefined>;

function readBuildEnv(
  processEnv: EnvironmentValues,
  fileEnv: EnvironmentValues,
  ...names: string[]
): string {
  for (const name of names) {
    const processValue = processEnv[name]?.trim();
    const fileValue = fileEnv[name]?.trim();
    if (processValue) return processValue;
    if (fileValue) return fileValue;
  }
  return "";
}

export function assertBrowserSafeSupabaseKey(key: string): void {
  if (!key) return;

  if (/^(sb_secret_|sb_service_role_)/i.test(key)) {
    throw new Error(
      "The DB1 browser key is a Supabase secret key. Use a publishable/anon key for VITE_DB1_ANON_KEY; keep service-role/secret keys server-side.",
    );
  }

  // Legacy anon keys are JWTs. Reject a service_role JWT before it can be bundled.
  const payload = key.split(".")[1];
  if (!payload) return;

  let claims: { role?: unknown } | undefined;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: unknown;
    };
  } catch {
    // Opaque publishable keys are not JWTs; no JWT validation is needed for those.
  }

  if (claims?.role === "service_role") {
    throw new Error(
      "The DB1 browser key contains the service_role claim. Use the public anon/publishable key; never bundle a service-role key.",
    );
  }
}

export function resolvePublicDb1Config(
  processEnv: EnvironmentValues,
  fileEnv: EnvironmentValues,
): { url: string; key: string } {
  const url = readBuildEnv(processEnv, fileEnv, "VITE_DB1_URL", "DB1_URL");
  const key = readBuildEnv(
    processEnv,
    fileEnv,
    "VITE_DB1_ANON_KEY",
    "DB1_PUBLISHABLE_KEY",
    "DB1_ANON_KEY",
  );

  assertBrowserSafeSupabaseKey(key);
  return { url, key };
}
