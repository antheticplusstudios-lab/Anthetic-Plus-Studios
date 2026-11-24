/** Inworld text-to-speech with per-automation key rotation (DB2 automation_key_pools). */
import { getDb } from "@/server/db/clients.server";
import { joinMp3 } from "@/lib/mp3-join";
import { decryptSecret } from "@/server/security/envelope.server";
import { runWithPool, type PoolKeyState, type PoolRunOutcome, type PoolScope } from "./key-pool";
import {
  InworldTtsError,
  inworldOutcome,
  inworldRequest,
  splitForInworld,
  type InworldFailureCode,
} from "./inworld-pool";

type Row = {
  id: string;
  key_ciphertext: string;
  enabled: boolean;
  uses: number;
  failures: number;
  cooldown_until: string;
};

export async function inworldKeyCount(scope: PoolScope) {
  const { count, error } = await getDb("db2")
    .from("automation_key_pools")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("provider", "inworld")
    .eq("enabled", true);
  // A database failure must not be reported as "no keys configured".
  if (error) throw new Error(`Inworld keys: ${error.message}`);
  return count ?? 0;
}

function isAbort(e: unknown, signal?: AbortSignal) {
  return (
    Boolean(signal?.aborted) ||
    (typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError")
  );
}

function decodeBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const KIND_TO_CODE: Record<string, InworldFailureCode> = {
  limit: "rate_limited",
  auth: "rejected_credentials",
  transient: "upstream_unavailable",
  fatal: "bad_request",
};

/**
 * Synthesize MP3 audio. Switches to the next key instantly on limit/auth errors and throws an
 * InworldTtsError (never a silent fallback) when no key can produce audio.
 */
export async function inworldSpeak(args: {
  scope: PoolScope;
  text: string;
  voiceId: string;
  model: string;
  signal?: AbortSignal;
}): Promise<Uint8Array<ArrayBuffer>> {
  const db = getDb("db2");
  const { data, error } = await db
    .from("automation_key_pools")
    .select("id,key_ciphertext,enabled,uses,failures,cooldown_until")
    .eq("scope", args.scope)
    .eq("provider", "inworld");
  if (error) throw new Error(`Inworld keys: ${error.message}`);
  const rows = ((data ?? []) as Row[]).filter((r) => r.enabled);
  if (!rows.length) {
    throw new InworldTtsError(
      "not_configured",
      `No enabled Inworld keys for scope "${args.scope}". Add one in Admin → Automation API keys.`,
    );
  }

  // Decrypt up front. A key that cannot be decrypted is a server-configuration problem, not a
  // provider rejection, so it must never be written back to the pool as a resting/failed key.
  const secrets = new Map<string, string>();
  for (const r of rows) {
    try {
      secrets.set(r.id, decryptSecret(r.key_ciphertext));
    } catch {
      /* counted below */
    }
  }
  if (!secrets.size) {
    throw new InworldTtsError(
      "keys_unreadable",
      `Inworld keys exist but none could be decrypted. Check ANTHETICPLUS_DB3_MASTER_KEY (it must be the key they were saved with).`,
    );
  }

  const initial: PoolKeyState[] = rows
    .filter((r) => secrets.has(r.id))
    .map((r) => ({
      id: r.id,
      label: "",
      enabled: r.enabled,
      uses: Number(r.uses),
      failures: Number(r.failures),
      cooldownUntil: new Date(r.cooldown_until).getTime(),
    }));

  const chunks = splitForInworld(args.text);
  if (!chunks.length) throw new InworldTtsError("bad_request", "Nothing to synthesize.");

  let states = initial;
  let lastMessage = "";
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let failed: PoolRunOutcome<Uint8Array<ArrayBuffer>> | null = null;

  try {
    for (const chunk of chunks) {
      const out = await runWithPool(states, { ...args, text: chunk }, async (keyId, p) => {
        const req = inworldRequest(p.text, p.voiceId, p.model, secrets.get(keyId)!);
        let res: Response;
        try {
          res = await fetch(req.url, {
            ...req.init,
            ...(args.signal ? { signal: args.signal } : {}),
          });
        } catch (e) {
          if (isAbort(e, args.signal)) throw e;
          lastMessage = "Inworld request failed (network error)";
          return { ok: false, kind: "transient", message: lastMessage };
        }
        const body = await res.text();
        if (!res.ok) {
          const o = inworldOutcome(res.status, body, res.headers.get("retry-after"));
          lastMessage = o.ok ? "" : (o.message ?? "");
          return o;
        }
        let audio = "";
        try {
          audio = String((JSON.parse(body) as { audioContent?: unknown }).audioContent ?? "");
        } catch {
          lastMessage = "Inworld returned an unreadable response";
          return { ok: false, kind: "transient", message: lastMessage };
        }
        if (!audio) {
          lastMessage = "Inworld returned an empty audio payload";
          return { ok: false, kind: "transient", message: lastMessage };
        }
        return { ok: true, value: decodeBase64(audio) };
      });
      states = out.keys;
      if (!out.value) {
        failed = out;
        break;
      }
      parts.push(out.value);
    }
  } finally {
    // Persist usage/cooldown even when the request failed or was cancelled part-way.
    await Promise.all(
      states.map((k) => {
        const before = initial.find((x) => x.id === k.id)!;
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
  }

  if (failed) {
    if (failed.attempts.length === 0) {
      const soonest = Math.min(...states.filter((k) => k.enabled).map((k) => k.cooldownUntil));
      const wait = Math.max(5, Math.min(1800, Math.ceil((soonest - Date.now()) / 1000)));
      throw new InworldTtsError(
        "keys_resting",
        `All Inworld keys are resting after recent errors (soonest ready in ~${wait}s). Use Test on a key in Admin → Automation API keys.`,
        wait,
      );
    }
    const lastKind = failed.attempts[failed.attempts.length - 1]!.kind;
    const code = KIND_TO_CODE[lastKind] ?? "upstream_unavailable";
    const trail = failed.attempts.map((a) => a.kind).join(",");
    throw new InworldTtsError(
      code,
      `${lastMessage || failed.error || "Inworld voice failed"} (key attempts: ${trail})`,
      code === "rate_limited" ? 60 : undefined,
    );
  }

  const audio = joinMp3(parts);
  if (!audio.byteLength) throw new InworldTtsError("empty_audio", "Inworld returned no audio.");
  return audio;
}
