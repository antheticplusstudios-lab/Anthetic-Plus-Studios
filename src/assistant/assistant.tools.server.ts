/** The tool registry. Add new tools here — text and voice pick them up automatically. */
import type { AssistantTool } from "./assistant.registry.server";
import { sendEmailTool } from "./tools/email.tool.server";
import { getAccountTool, getAutomationStatusTool, getOrdersTool, getSubscriptionsTool } from "./tools/account.tool.server";
import { getPricingTool, retrieveKnowledgeTool } from "./tools/knowledge.tool.server";
import { platformOverviewTool } from "./tools/admin.tool.server";
import { searchSiteKnowledgeTool } from "./tools/site-knowledge.tool.server";

export const ASSISTANT_TOOLS: AssistantTool[] = [
  searchSiteKnowledgeTool,
  getPricingTool,
  getAccountTool,
  getSubscriptionsTool,
  getOrdersTool,
  getAutomationStatusTool,
  retrieveKnowledgeTool,
  sendEmailTool,
  platformOverviewTool,
];

export function findTool(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}
