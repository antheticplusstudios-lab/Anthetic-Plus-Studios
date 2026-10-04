import { z } from "zod";
import { defineTool } from "../assistant.registry.server";
import { searchSiteKnowledge } from "../sites/site-knowledge.server";

const input = z.object({ query: z.string().trim().min(2).max(300) });

/** Searches ONLY the resolved site's knowledge (ctx.site), so sites can never read each other's content. */
export const searchSiteKnowledgeTool = defineTool<z.infer<typeof input>>({
  name: "search_site_knowledge",
  label: "Site knowledge",
  description: "Search this website's approved knowledge (services, FAQs, policies, contact, pricing if published). Use before answering factual questions not already in your context.",
  inputDoc: '{"query":"string"}',
  access: "public",
  sideEffect: false,
  input,
  async execute(data, ctx) {
    const hits = searchSiteKnowledge(ctx.site.config, data.query);
    return { ok: true, summary: `Found ${hits.length} passage(s).`, data: hits };
  },
});
