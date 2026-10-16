/** Inworld text-to-speech with per-automation key rotation (DB2 automation_key_pools). */
import { getDb } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";
import { runWithPool, type PoolKeyState, type PoolScope } from "./key-pool";
import { inworldOutcome, inworldRequest } from "./inworld-pool";

type Row = {
  id: string;
  key_ciphertext: string;
  enabled: boolean;
  uses: number;
  failures: number;
  cooldown_until: string;
};

export async function inworldKeyCount(scope: PoolScope) {
  const { count } = await getDb("db2")
    .from("automation_key_pools")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("provider", "inworld")
    .eq("enabled", true);
  return count ?? 0;
}

/** Synthesize MP3 audio. Switches to the next key instantly on limit/auth errors. */
export async function inworldSpeak(args: {
  scope: PoolScope;
  text: string;
  voiceId: string;
  model: string;
}) {
  const db = getDb("db2");
  const { data, error } = await db
    .from("automation_key_pools")
    .select("id,key_ciphertext,enabled,uses,failures,cooldown_until")
    .eq("scope", args.scope)
    .eq("provider", "inworld");
  if (error) throw new Error(`Inworld keys: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const secrets = new Map(rows.map((r) => [r.id, r.key_ciphertext]));
  const keys: PoolKeyState[] = rows.map((r) => ({
    id: r.id,
    label: "",
    enabled: r.enabled,
    uses: Number(r.uses),
    failures: Number(r.failures),
    cooldownUntil: new Date(r.cooldown_until).getTime(),
  }));
  const out = await runWithPool(keys, args, async (keyId, p) => {
    let key: string;
    try {
      key = decryptSecret(secrets.get(keyId)!);
    } catch {
      return { ok: false, kind: "auth", message: "Key could not be decrypted" };
    }
    const req = inworldRequest(p.text, p.voiceId, p.model, key);
    const res = await fetch(req.url, req.init).catch(() => null);
    if (!res) return { ok: false, kind: "transient" };
    const body = await res.text();
    if (!res.ok) return inworldOutcome(res.status, body);
    const json = JSON.parse(body) as { audioContent?: string };
    if (!json.audioContent) return { ok: false, kind: "transient", message: "Empty audio" };
    return { ok: true, value: Uint8Array.from(atob(json.audioContent), (c) => c.charCodeAt(0)) };
  });
  await Promise.all(
    out.keys.map((k) => {
      const before = keys.find((x) => x.id === k.id)!;
      if (before.uses === k.uses && before.failures === k.failures) return null;
      return db
        .from("automation_key_pools")
        .update({
          uses: k.uses,
          failures: k.failures,
          cooldown_until: new Date(k.cooldownUntil).toISOString(),
        })
        .eq("id", k.id);
    }),
  );
  if (!out.value)
    throw new Error(out.error ?? "Inworld voice failed. Add Inworld keys in Automation API keys.");
  return out.value;
}
