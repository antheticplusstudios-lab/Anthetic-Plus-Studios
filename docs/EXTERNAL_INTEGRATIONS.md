# External automation integrations

The four canonical automation engines use encrypted DB2 `integration_connections` records for tenant-specific provider credentials.

## Voice & SMS Receptionist

Provider: `twilio`

Credentials accepted by the Automation Portal:
- `accountSid`
- `authToken` **or** `apiKeySid` + `apiKeySecret`
- `fromNumber` or `messagingServiceSid`

Inbound endpoints:
- `/api/public/integrations/twilio/sms`
- `/api/public/integrations/twilio/voice`

Configure the Twilio phone number's SMS and Voice webhooks to the matching endpoint. Twilio signatures are validated before processing.

## Social DM Assistant

Providers:
- `whatsapp`
- `meta_page` / `messenger`
- `instagram`

Credentials accepted:
- `accessToken`
- `phoneNumberId` for WhatsApp
- `pageId` for Messenger/Facebook Page
- `instagramBusinessAccountId` for Instagram

Inbound endpoint:
- `/api/public/integrations/meta/webhook`

Set `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` in the server environment and subscribe the relevant Meta assets to the webhook. The Graph API version defaults to `v26.0` and can be overridden with `META_GRAPH_VERSION`.

## AI Lead Capture & Smart Qualifier

The engine stores the lead, scores it, performs round-robin assignment for qualified leads, and can:
- send an immediate follow-up SMS through the automation's Twilio connection;
- send a hot-lead notification through Resend;
- POST a JSON lead event to the configured `webhook_url`.

Resend uses:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Knowledge Base Support Agent

Knowledge retrieval is performed from DB3 and support conversations/escalations are stored in DB4. When no sufficiently similar knowledge is found, the engine creates a DB4 escalation and round-robin assignment instead of inventing an answer.

## Calendar

Google Calendar credentials accepted:
- `accessToken`
- `refreshToken`
- `clientId`
- `clientSecret`
- optional `calendarId`

The integration supports availability lookup and event creation through the Google Calendar API. Access tokens are refreshed from the stored refresh token when needed.

## Security

Provider credentials are encrypted with `ANTHETICPLUS_DB3_MASTER_KEY` before storage. They are never returned by the portal status queries. Provider connection saves perform a live credential verification before marking the connection `connected`.

### Receptionist booking and handoff behaviour

The receptionist parses appointment intent into a structured action before touching the calendar. For a concrete requested time it checks Google Calendar free/busy first; only an available, explicit booking request creates a Google Calendar event and a DB4 appointment record. It does not claim a booking when the calendar is unavailable or the requested slot is busy.

Escalated voice calls are assigned to the configured round-robin team. If the receptionist's `handoff_contact` contains a phone number, the Twilio voice route uses `<Dial>` to call that number; otherwise it records the escalation and returns a hold/unavailable response. SMS escalation is recorded and assigned for staff follow-up rather than pretending a human was reached.
