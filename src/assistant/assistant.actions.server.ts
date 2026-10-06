/**
 * Signed pending-action tokens. A side-effecting tool call is frozen into an
 * HMAC-signed token bound to the user; the browser can only present it back
 * for confirmation, never alter it. Key derived from an existing server secret.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const TTL_MS = 10 * 60 * 1000;

export type ActionPayload = {
  id: string;
  uid: string;
  tool: string;
  input: unknown;
  exp: number;
  rid: string;
};

function key(): Buffer {
  const master = process.env.ANTHETICPLUS_DB3_MASTER_KEY;
  if (!master)
    throw new Error("Missing required server environment variable: ANTHETICPLUS_DB3_MASTER_KEY");
  return createHmac("sha256", master).update("assistant-action-v1").digest();
}

function sign(body: string) {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function createActionToken(args: {
  uid: string;
  tool: string;
  input: unknown;
  rid: string;
}) {
  const payload: ActionPayload = {
    id: randomUUID(),
    uid: args.uid,
    tool: args.tool,
    input: args.input,
    exp: Date.now() + TTL_MS,
    rid: args.rid,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${sign(body)}`, payload };
}

export function verifyActionToken(token: string): ActionPayload | "invalid" | "expired" {
  const [body, sig] = token.split(".");
  if (!body || !sig) return "invalid";
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActionPayload;
    if (payload.exp < Date.now()) return "expired";
    return payload;
  } catch {
    return "invalid";
  }
}
