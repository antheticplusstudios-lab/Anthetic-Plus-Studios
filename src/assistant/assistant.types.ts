/**
 * Client-safe assistant contracts. Shared by the server assistant service and
 * the text + voice interfaces so both render the same authoritative results.
 */

export type ChatRole = "user" | "assistant";

export type ChatTurn = { role: ChatRole; content: string };

export type AssistantLanguage = {
  language: string;
  locale: string;
  script: "Latin" | "Bengali" | "Devanagari" | "Arabic" | "Cyrillic" | "CJK" | "Other";
  confidence: number;
  mixedLanguages: string[];
};

/** A tool that actually ran on the server (or was refused by the server). */
export type ToolOutcome = {
  tool: string;
  label: string;
  status: "success" | "failed" | "denied";
  /** Human-readable, server-authored summary, e.g. "Email sent to john@example.com." */
  summary: string;
};

/** A side-effecting action proposed by the assistant, awaiting explicit user confirmation. */
export type PendingAction = {
  /** Signed, server-issued token. The browser cannot alter the action it represents. */
  token: string;
  tool: string;
  title: string;
  fields: Array<{ label: string; value: string }>;
  expiresAt: string;
};

export type AssistantErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "offline"
  | "ai_unavailable"
  | "tool_failed"
  | "invalid_input"
  | "expired"
  | "network"
  | "internal";

export type AssistantSuccess = {
  ok: true;
  reply: string;
  actions: ToolOutcome[];
  pending: PendingAction | null;
  language: AssistantLanguage;
  requestId: string;
};

export type AssistantFailure = {
  ok: false;
  error: { code: AssistantErrorCode; message: string };
  requestId: string;
};

export type AssistantResponse = AssistantSuccess | AssistantFailure;

export type AssistantPublicConfig = {
  enabled: boolean;
  voiceEnabled: boolean;
  welcomeMessage: string;
};

export const MAX_MESSAGE_LENGTH = 1200;
export const MAX_HISTORY_TURNS = 12;
