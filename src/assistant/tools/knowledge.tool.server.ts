import { db2Admin } from "@/server/db/clients.server";
import { z } from "zod";
import { retrieveKnowledge } from "@/lib/rag.server";
import { defineTool } from "../assistant.registry.server";

export const getPricingTool = defineTool({
  name: "get_pricing",
  label: "Custom packages",
  description:
    "Explain that Autumic scopes each package to the business and does not publish fixed public prices. Offer a free consultation at /contact.",
  inputDoc: "{}",
  access: "public",
  sideEffect: false,
  input: z.object({}).passthrough(),
  async execute() {
    return {
      ok: true,
      summary: "Autumic packages are custom-scoped; there is no public fixed-price list.",
      data: {
        pricing: "Custom proposal after a free consultation",
        consultation: "/contact",
        email: "info@autumic.com",
        phone: "+880 1915-349394",
      },
    };
  },
});

const kbInput = z.object({
  automationId: z.string().trim().min(1),
  query: z.string().trim().min(2),
});

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
