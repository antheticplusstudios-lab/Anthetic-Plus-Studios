import type { Json } from "@/integrations/supabase/types";
import { decryptSecret } from "@/server/security/envelope.server";
import { db2Admin, db4Admin } from "@/server/db/clients.server";

type RecordValue = Record<string, unknown>;

export type Integration = {
  id: string;
  provider: string;
  account_label: string | null;
  credential_ciphertext: string;
  status: string;
  scopes: unknown;
};

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getIntegration(
  automationId: string,
  providers: string[],
): Promise<Integration | null> {
  const { data, error } = await db2Admin
    .from("integration_connections")
    .select("id,provider,account_label,credential_ciphertext,status,scopes")
    .eq("automation_id", automationId)
    .in("provider", providers)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`integration lookup: ${error.message}`);
  return (data as Integration | null) ?? null;
}

export function decryptIntegration(integration: Integration): RecordValue {
  const raw = decryptSecret(integration.credential_ciphertext);
  const parsed = JSON.parse(raw) as unknown;
  const value = record(parsed);
  if (!Object.keys(value).length)
    throw new Error(`Integration ${integration.provider} has invalid credentials.`);
  return value;
}

async function postForm(url: string, fields: Record<string, string>, auth?: string) {
  const body = new URLSearchParams(fields);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(auth ? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {}),
    },
    body,
  });
  const text = await response.text();
  let json: RecordValue = {};
  try {
    json = record(JSON.parse(text));
  } catch {
    /* non-json response */
  }
  if (!response.ok)
    throw new Error(String(json.message ?? json.error_message ?? text).slice(0, 500));
  return json;
}

async function postJson(url: string, body: unknown, token: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: RecordValue = {};
  try {
    json = record(JSON.parse(text));
  } catch {
    /* non-json response */
  }
  if (!response.ok)
    throw new Error(String(record(json.error).message ?? json.message ?? text).slice(0, 500));
  return json;
}

export async function sendTwilioMessage(args: { automationId: string; to: string; body: string }) {
  const integration = await getIntegration(args.automationId, ["twilio"]);
  if (!integration) throw new Error("Twilio integration is not connected.");
  const c = decryptIntegration(integration);
  const accountSid = stringValue(c.accountSid);
  const apiKey = stringValue(c.apiKeySid);
  const apiSecret = stringValue(c.apiKeySecret);
  const authToken = stringValue(c.authToken);
  const from = stringValue(c.fromNumber);
  const messagingServiceSid = stringValue(c.messagingServiceSid);
  if (!accountSid || (!from && !messagingServiceSid) || (!apiKey && !authToken))
    throw new Error("Twilio credentials are incomplete.");
  const authUser = apiKey || accountSid;
  const authPass = apiKey ? apiSecret : authToken;
  const result = await postForm(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      Body: args.body.slice(0, 1600),
      To: args.to,
      ...(from ? { From: from } : {}),
      ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : {}),
    },
    `${authUser}:${authPass}`,
  );
  return {
    provider: "twilio",
    externalId: stringValue(result.sid),
    status: stringValue(result.status) || "queued",
  };
}

function graphVersion(c: RecordValue) {
  return stringValue(c.graphVersion) || process.env.META_GRAPH_VERSION?.trim() || "v26.0";
}

export async function sendMetaMessage(args: {
  automationId: string;
  platform: string;
  recipientId: string;
  body: string;
}) {
  const platform = args.platform.toLowerCase();
  const integration = await getIntegration(
    args.automationId,
    platform === "whatsapp" ? ["whatsapp", "meta"] : [platform, "meta", "meta_page"],
  );
  if (!integration) throw new Error(`Meta ${platform} integration is not connected.`);
  const c = decryptIntegration(integration);
  const token = stringValue(c.accessToken);
  if (!token) throw new Error("Meta access token is missing.");
  const base = `https://graph.facebook.com/${graphVersion(c)}`;
  let endpoint: string;
  let payload: RecordValue;
  if (platform === "whatsapp") {
    const phoneNumberId = stringValue(c.phoneNumberId);
    if (!phoneNumberId) throw new Error("WhatsApp phone number ID is missing.");
    endpoint = `${base}/${encodeURIComponent(phoneNumberId)}/messages`;
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.recipientId,
      type: "text",
      text: { preview_url: false, body: args.body.slice(0, 4096) },
    };
  } else if (platform === "messenger") {
    const pageId = stringValue(c.pageId);
    if (!pageId) throw new Error("Meta Page ID is missing.");
    endpoint = `${base}/${encodeURIComponent(pageId)}/messages`;
    payload = {
      recipient: { id: args.recipientId },
      messaging_type: "RESPONSE",
      message: { text: args.body.slice(0, 2000) },
    };
  } else if (platform === "instagram") {
    const igUserId = stringValue(c.instagramBusinessAccountId || c.igUserId);
    if (!igUserId) throw new Error("Instagram business account ID is missing.");
    endpoint = `${base}/${encodeURIComponent(igUserId)}/messages`;
    payload = { recipient: { id: args.recipientId }, message: { text: args.body.slice(0, 2000) } };
  } else {
    throw new Error(`Unsupported Meta messaging platform: ${platform}`);
  }
  const result = await postJson(endpoint, payload, token);
  return {
    provider: platform,
    externalId: stringValue(result.message_id || result.id),
    status: "sent",
  };
}

async function googleAccessToken(c: RecordValue) {
  const access = stringValue(c.accessToken);
  const expiresAt = Number(c.expiresAt ?? 0);
  if (access && (!expiresAt || expiresAt > Date.now() + 60_000)) return access;
  const refresh = stringValue(c.refreshToken);
  const clientId = stringValue(c.clientId);
  const clientSecret = stringValue(c.clientSecret);
  if (!refresh || !clientId || !clientSecret)
    throw new Error("Google Calendar credentials are incomplete or expired.");
  const token = await postForm("https://oauth2.googleapis.com/token", {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const next = stringValue(token.access_token);
  if (!next) throw new Error("Google did not return a refreshed access token.");
  return next;
}

export async function findCalendarAvailability(args: {
  automationId: string;
  timeMin: string;
  timeMax: string;
  calendarId?: string;
}) {
  const integration = await getIntegration(args.automationId, ["google_calendar", "google"]);
  if (!integration) throw new Error("Google Calendar integration is not connected.");
  const c = decryptIntegration(integration);
  const token = await googleAccessToken(c);
  const calendarId = args.calendarId || stringValue(c.calendarId) || "primary";
  const url = new URL(`https://www.googleapis.com/calendar/v3/freeBusy`);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      items: [{ id: calendarId }],
    }),
  });
  const text = await response.text();
  const json = record(JSON.parse(text));
  if (!response.ok) throw new Error(String(record(json.error).message ?? text).slice(0, 500));
  return json;
}

export async function createCalendarEvent(args: {
  automationId: string;
  start: string;
  end: string;
  summary: string;
  description?: string;
  attendeeEmail?: string;
  calendarId?: string;
}) {
  const integration = await getIntegration(args.automationId, ["google_calendar", "google"]);
  if (!integration) throw new Error("Google Calendar integration is not connected.");
  const c = decryptIntegration(integration);
  const token = await googleAccessToken(c);
  const calendarId = encodeURIComponent(args.calendarId || stringValue(c.calendarId) || "primary");
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        summary: args.summary,
        description: args.description || undefined,
        start: { dateTime: args.start },
        end: { dateTime: args.end },
        ...(args.attendeeEmail ? { attendees: [{ email: args.attendeeEmail }] } : {}),
      }),
    },
  );
  const text = await response.text();
  const json = record(JSON.parse(text));
  if (!response.ok) throw new Error(String(record(json.error).message ?? text).slice(0, 500));
  return { id: stringValue(json.id), htmlLink: stringValue(json.htmlLink) };
}

export async function markMessageDelivered(
  messageId: string,
  result: { provider: string; externalId?: string; status?: string },
) {
  const { data, error } = await db4Admin
    .from("messages")
    .select("metadata")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const metadata = record(data?.metadata);
  metadata.delivery = {
    status: result.status || "sent",
    provider: result.provider,
    external_id: result.externalId || null,
    delivered_at: new Date().toISOString(),
  };
  const update = await db4Admin
    .from("messages")
    .update({ external_message_id: result.externalId || null, metadata: metadata as Json })
    .eq("id", messageId);
  if (update.error) throw new Error(update.error.message);
}

export async function sendResendEmail(args: { to: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) throw new Error("Resend email delivery is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject.slice(0, 180),
      text: args.body.slice(0, 10000),
    }),
  });
  const text = await response.text();
  const json = record(JSON.parse(text));
  if (!response.ok) throw new Error(String(json.message ?? text).slice(0, 500));
  return { provider: "resend", externalId: stringValue(json.id), status: "sent" };
}

export async function postLeadWebhook(url: string, payload: RecordValue) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "AntheticPlus-Automation/1.0" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Lead webhook returned HTTP ${response.status}`);
  return { status: "sent" };
}

export async function verifyIntegrationCredentials(provider: string, credentials: RecordValue) {
  const c = credentials;
  if (provider === "twilio") {
    const sid = stringValue(c.accountSid);
    const user = stringValue(c.apiKeySid) || sid;
    const pass = stringValue(c.apiKeySid) ? stringValue(c.apiKeySecret) : stringValue(c.authToken);
    if (!sid || !user || !pass)
      throw new Error("Twilio Account SID and API credentials are required.");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
      { headers: { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` } },
    );
    if (!response.ok) throw new Error("Twilio rejected the supplied credentials.");
    if (!stringValue(c.fromNumber) && !stringValue(c.messagingServiceSid))
      throw new Error("Twilio requires a From number or Messaging Service SID.");
    return { account: sid };
  }
  if (["whatsapp", "meta_page", "messenger", "instagram"].includes(provider)) {
    const token = stringValue(c.accessToken);
    if (!token) throw new Error("Meta access token is required.");
    const id =
      provider === "whatsapp"
        ? stringValue(c.phoneNumberId)
        : provider === "instagram"
          ? stringValue(c.instagramBusinessAccountId || c.igUserId)
          : stringValue(c.pageId);
    if (!id) throw new Error("The provider asset ID is required.");
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion(c)}/${encodeURIComponent(id)}?fields=id`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error("Meta rejected the supplied token or asset ID.");
    return { account: id };
  }
  if (provider === "google_calendar") {
    const token = await googleAccessToken(c);
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error("Google rejected the supplied Calendar credentials.");
    return { account: stringValue(c.calendarId) || "primary" };
  }
  throw new Error(`Unsupported integration provider: ${provider}`);
}
