/**
 * Central tool contract + authorization. Every tool declares its access level;
 * authorization is re-checked on the server immediately before execution using
 * the existing RBAC helpers and the server-resolved tenant context.
 */
import type { z } from "zod";
import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertOwner, assertStaff, assertTenantActive } from "@/lib/rbac.server";
import type { AssistantSettings } from "./assistant.settings.server";
import type { ResolvedSite } from "./sites/site-context.server";
import { SITES, SITE_TOOL_CATALOG } from "./sites/site-registry";

export type ToolAccess = "public" | "member" | "staff" | "admin" | "owner";

export type ToolContext = {
  requestId: string;
  /** Null for signed-out visitors. Always resolved server-side. */
  auth: AuthContext | null;
  settings: AssistantSettings;
  /** Server-validated website context. Selects knowledge/config only; never grants access. */
  site: ResolvedSite;
};

/** Site gate: tool must be enabled for the site, and first-party-only tools never run on partner sites. */
export function siteAllows(tool: { name: string; access: ToolAccess }, ctx: ToolContext): boolean {
  if (!ctx.site.config.allowedTools.includes(tool.name)) return false;
  const meta = SITE_TOOL_CATALOG.find((t) => t.name === tool.name);
  if (!meta) return false;
  if ((meta.firstPartyOnly || tool.access !== "public") && !SITES[ctx.site.id].firstParty)
    return false;
  return true;
}

export type ToolResult =
  | { ok: true; summary: string; data: unknown }
  | {
      ok: false;
      code: "forbidden" | "invalid_input" | "not_configured" | "failed";
      message: string;
    };

export type ActionPreview = { title: string; fields: Array<{ label: string; value: string }> };

export type AssistantTool<I = unknown> = {
  name: string;
  /** Short label for UI chips. */
  label: string;
  /** Instructions for the model. */
  description: string;
  /** Human-readable argument shape shown to the model. */
  inputDoc: string;
  access: ToolAccess;
  /** Side-effecting tools never run without explicit user confirmation. */
  sideEffect: boolean;
  input: z.ZodType<I>;
  /** Optional tool-specific policy check (beyond access level). */
  authorize?: (input: I, ctx: ToolContext) => Promise<string | null> | string | null;
  preview?: (input: I, ctx: ToolContext) => ActionPreview;
  execute: (input: I, ctx: ToolContext) => Promise<ToolResult>;
};

export type ErasedAssistantTool = {
  name: string;
  label: string;
  description: string;
  inputDoc: string;
  access: ToolAccess;
  sideEffect: boolean;
  input: z.ZodTypeAny;
  authorize?: (input: unknown, ctx: ToolContext) => Promise<string | null> | string | null;
  preview?: (input: unknown, ctx: ToolContext) => ActionPreview;
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
};

/** Returns a safe denial message, or null when the caller may use the tool. */
export function checkAccess(tool: ErasedAssistantTool, ctx: ToolContext): string | null {
  if (!siteAllows(tool, ctx)) return "That isn't available on this website.";
  if (tool.access === "public") return null;
  if (!ctx.auth) return "Please sign in to use that.";
  try {
    assertTenantActive(ctx.auth);
    if (tool.access === "staff") assertStaff(ctx.auth);
    if (tool.access === "admin") assertAdmin(ctx.auth);
    if (tool.access === "owner") assertOwner(ctx.auth);
    return null;
  } catch {
    return "Your account doesn't have permission for that.";
  }
}

export function defineTool<I>(tool: AssistantTool<I>): ErasedAssistantTool {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    inputDoc: tool.inputDoc,
    access: tool.access,
    sideEffect: tool.sideEffect,
    input: tool.input,
    ...(tool.authorize
      ? { authorize: (input, ctx) => tool.authorize?.(tool.input.parse(input), ctx) ?? null }
      : {}),
    ...(tool.preview
      ? { preview: (input, ctx) => tool.preview!(tool.input.parse(input), ctx) }
      : {}),
    execute: (input, ctx) => tool.execute(tool.input.parse(input), ctx),
  };
}
