/**
 * Turns a client's plain-language request into a catalog-bound proposal using the
 * platform's own provider key pool (Groq etc. from DB3 llm_api_keys) — not a hosted AI service.
 * The output is always re-validated against the automation's catalog by validateProposal.
 */
import { TOOL_CATALOG, type RawProposal } from "@/lib/tool-catalog";
import type { EngineKind } from "@/lib/automations";

export function parseProposal(text: string): RawProposal {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()) as Record<string, unknown>;
  } catch {
    throw new Error("The AI returned an unreadable proposal. Please try rephrasing.");
  }
  const tools = Array.isArray(j.tools) ? j.tools : [];
  return {
    summary: String(j.summary ?? ""),
    tools: tools
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t) => ({
        id: String(t.id ?? ""),
        reason: String(t.reason ?? ""),
        inputs: Array.isArray(t.inputs) ? t.inputs.map(String) : [],
      })),
    unsupported: Array.isArray(j.unsupported) ? j.unsupported.map(String) : [],
  };
}

export async function proposeWithAi(
  kind: EngineKind,
  request: string,
  scope: { automationId: string; clientId: string },
): Promise<RawProposal> {
  const { routeChat } = await import("@/lib/llm-router.server");
  const catalog = TOOL_CATALOG[kind]
    .map((t) => `- ${t.id}: ${t.label} — ${t.description}`)
    .join("\n");
  const r = await routeChat(
    [
      {
        role: "system",
        content:
          `You configure a business automation. Map the client's request ONLY to tool ids from this catalog:\n${catalog}\n` +
          `Never invent ids. Put anything the catalog can't do in "unsupported". "inputs" lists details each tool collects. ` +
          `Return ONLY json: {"summary": string, "tools": [{"id": string, "reason": string, "inputs": string[]}], "unsupported": string[]}`,
      },
      { role: "user", content: request },
    ],
    {
      automationId: scope.automationId,
      clientId: scope.clientId,
      maxTokens: 700,
      temperature: 0.1,
      jsonMode: true,
    },
  );
  if (!r?.reply)
    throw new Error("No AI provider key is available right now. Please try again shortly.");
  return parseProposal(r.reply);
}
