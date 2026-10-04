import { z } from "zod";
import { db2Admin } from "@/server/db/clients.server";
import { retrieveKnowledge } from "@/lib/rag.server";
import { defineTool } from "../assistant.registry.server";

export const getPricingTool = defineTool({
  name: "get_pricing",
  label: "Pricing",
  description: "Get the live, publicly listed automation plans and prices. Use for any pricing or plan question.",
  inputDoc: "{}",
  access: "public",
  sideEffect: false,
  input: z.object({}).passthrough(),
  async execute() {
    const { data, error } = await db2Admin
      .from("pricing_plans")
      .select("slug,name,description,monthly_price,yearly_price,currency")
      .eq("active", true)
      .eq("listed", true)
      .order("slug", { ascending: true })
      .limit(50);
    if (error) {
      console.error("assistant pricing read failed", error.message);
      return { ok: false, code: "failed", message: "I couldn't load pricing right now." };
    }
    return { ok: true, summary: `Loaded ${data?.length ?? 0} listed plan(s).`, data: data ?? [] };
  },
});

const kbInput = z.object({ automationId: z.string().trim().min(1), query: z.string().trim().min(2) });

export const retrieveKnowledgeTool = defineTool<z.infer<typeof kbInput>>({
  name: "retrieve_knowledge",
  label: "Knowledge base",
  description:
    "Search the knowledge base of one of the user's own automations. Get the automationId from get_automation_status first.",
  inputDoc: '{"automationId":"string","query":"string"}',
  access: "member",
  sideEffect: false,
  input: kbInput,
  async authorize(data, ctx) {
    const { data: row, error } = await db2Admin
      .from("client_automations")
      .select("id")
      .eq("id", data.automationId)
      .eq("client_id", ctx.auth!.tenant.clientId)
      .maybeSingle();
    if (error || !row) return "I couldn't find that automation on your account.";
    return null;
  },
  async execute(data) {
    const hits = await retrieveKnowledge(data.automationId, data.query.slice(0, 500), 5);
    return {
      ok: true,
      summary: `Found ${hits.length} relevant knowledge passage(s).`,
      data: hits.map((h) => ({ source: h.source_name, content: h.content.slice(0, 1200) })),
    };
  },
});
