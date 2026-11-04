# External automation integrations

The platform has four executable customer automation engines. Their language-model credentials are managed centrally in AI Infrastructure (DB3 `llm_api_keys`); each client automation selects from enabled providers through its own `config.provider_pool`. Do not add duplicate LLM credentials to the per-automation integration-key pool.

## 1. AI Receptionist (`ai_receptionist`)

What it currently does:
- Handles inbound phone/SMS turns and stores conversation history.
- Answers from the client's configured business profile, hours, services and FAQs.
- Applies configured escalation phrases and assigns escalations to the client's Round Robin team.
- Checks Google Calendar availability and creates confirmed appointments.
- Sends SMS replies through the automation's Twilio connection.

Optional/client-level integrations:
- **Twilio** for real phone numbers, inbound voice/SMS webhooks, SMS replies and call transfer. Website chat does not require Twilio.
- **Google Calendar** for availability checks and appointment creation.
- **Inworld** for generated spoken audio. Inworld voice keys are stored in DB2 `automation_key_pools` under the `ai_receptionist` scope; this is separate from the LLM provider pool.

Twilio credentials accepted:
- `accountSid`
- `authToken` or `apiKeySid` + `apiKeySecret`
- `fromNumber` or `messagingServiceSid`

Inbound endpoints:
- `/api/public/integrations/twilio/sms`
- `/api/public/integrations/twilio/voice`

Configure the Twilio phone number's SMS and Voice webhooks to the matching endpoint. Twilio signatures are validated before processing.

## 2. AI Lead Capture & Qualifier (`lead_capture`)

What it currently does:
- Validates the configured required lead fields.
- Scores leads using contact completeness, company information and configured intent keywords.
- Classifies leads into cold/warm/hot tiers.
- Assigns hot leads to the client's Round Robin team.
- Can send a configured SMS follow-up, email notification and `lead.created` webhook.

Optional integrations:
- **Twilio** only when SMS follow-up is configured and a phone number is available.
- **Resend** for email notifications, using platform environment variables `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- A client webhook URL for downstream CRM delivery.

Important: lead scoring is currently deterministic/rule-based. This engine does not run a free-form AI sales conversation; the public product description should not promise autonomous prospect conversations.

## 3. AI Customer Support Agent (`kb_support`)

What it currently does:
- Retrieves relevant approved knowledge from DB3.
- Answers from retrieved content using the central AI model router.
- Can include numbered source citations.
- Creates a support escalation when configured escalation rules match or no suitable knowledge is found.
- Assigns escalations to the client's Round Robin team and stores the conversation/ticket in DB4.

Integrations:
- No Twilio connection is required.
- No separate per-automation LLM key is required; AI providers are managed centrally.
- Knowledge content and retrieval are managed by the platform's training/knowledge pipeline.

## 4. Social & Messaging AI (`messaging_ai`)

What it currently does:
- Receives supported WhatsApp, Messenger and Instagram direct messages.
- Applies the configured business profile, products, FAQs and brand tone.
- Enforces an optional per-contact reply rate limit.
- Escalates configured messages to the client's Round Robin team.
- Sends replies through Meta's Graph API and records delivery status.

Client-level Meta credentials:
- `accessToken`
- `phoneNumberId` for WhatsApp
- `pageId` for Messenger/Facebook Page
- `instagramBusinessAccountId` for Instagram

Inbound endpoint:
- `/api/public/integrations/meta/webhook`

Set `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` in the server environment and subscribe the relevant Meta assets to the webhook. The Graph API version defaults to `v26.0` and can be overridden with `META_GRAPH_VERSION`.

**Twilio is not required for WhatsApp, Messenger or Instagram in this implementation.** These channels use Meta's API directly.

## Round Robin

Round Robin is a shared staff-assignment service, not an AI-provider rotation feature. Create a team once per client automation, add its staff/assignees, choose an assignment strategy and maintain member availability. The receptionist uses it for escalations, lead capture uses it for qualified/hot leads, and the support/messaging engines use it for escalations. New assignments are created by the engine; teams should not be recreated for each lead or conversation.

## Security

Client integration credentials are encrypted before storage and are not returned by portal status queries. Provider connection saves perform a live credential verification before marking the connection as connected. LLM provider keys are stored centrally in DB3; Inworld voice keys are stored in the per-automation DB2 key pool.
