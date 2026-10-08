import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { z } from "zod";
import { db1Admin, db2Admin } from "@/server/db/clients.server";
import { defineTool, type ToolContext } from "../assistant.registry.server";

const none = z.object({}).passthrough();

function clientId(ctx: ToolContext) {
  return ctx.auth!.tenant.clientId;
}

function fail(what: string, error: { message: string }) {
  console.error(`assistant ${what} read failed`, error.message);
  return {
    ok: false as const,
    code: "failed" as const,
    message: `I couldn't load your ${what} right now.`,
  };
}

export const getAccountTool = defineTool({
  name: "get_account",
  label: "Account",
  description:
    "Get the signed-in user's account profile: company, website, category, role and whether the profile is complete.",
  inputDoc: "{}",
  access: "member",
  sideEffect: false,
  input: none,
  async execute(_i, ctx) {
    const { data, error } = await db1Admin
      .from("profiles")
      .select("company_name,website_url,category,profile_completed")
      .eq("id", ctx.auth!.userId)
      .maybeSingle();
    if (error) return fail("account", error);
    return {
      ok: true,
      summary: "Loaded your account profile.",
      data: {
        email: ctx.auth!.tenant.email,
        role: ctx.auth!.tenant.role,
        company: data?.company_name ?? null,
        website: data?.website_url ?? null,
        category: data?.category ?? null,
        profileCompleted: Boolean(data?.profile_completed),
      },
    };
  },
});

export const getSubscriptionsTool = defineTool({
  name: "get_subscription",
  label: "Subscriptions",
  description: "List the user's subscriptions with plan, status, renewal and expiry dates.",
  inputDoc: "{}",
  access: "member",
  sideEffect: false,
  input: none,
  async execute(_i, ctx) {
    const { data, error } = await db2Admin
      .from("subscriptions")
      .select(
        "id,order_id,product_type,plan_code,status,renewal_at,current_period_end,grace_period_end,cancelled_at",
      )
      .eq("client_id", clientId(ctx))
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) return fail("subscriptions", error);
    return { ok: true, summary: `Found ${data?.length ?? 0} subscription(s).`, data: data ?? [] };
  },
});

export const getOrdersTool = defineTool({
  name: "get_orders",
  label: "Orders",
  description: "List the user's recent orders and their payment verification status.",
  inputDoc: "{}",
  access: "member",
  sideEffect: false,
  input: none,
  async execute(_i, ctx) {
    const orders = await db2Admin
      .from("orders")
      .select("*")
      .eq("client_id", clientId(ctx))
      .order("created_at", { ascending: false })
      .limit(15);
    if (orders.error) return fail("orders", orders.error);
    const orderIds = (orders.data ?? []).map((order) => order.id);
    const verifications = orderIds.length
      ? await db2Admin
          .from("payment_verifications")
          .select("order_id,status,notes,created_at,reviewed_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(15)
      : { data: [], error: null };
    if (verifications.error) return fail("orders", verifications.error);
    return {
      ok: true,
      summary: `Found ${orders.data?.length ?? 0} recent order(s).`,
      data: { orders: orders.data ?? [], verifications: verifications.data ?? [] },
    };
  },
});

export const getAutomationStatusTool = defineTool({
  name: "get_automation_status",
  label: "Automations",
  description:
    "List the user's automations with run state, domain, expiry and whether reinstallation is required.",
  inputDoc: "{}",
  access: "member",
  sideEffect: false,
  input: none,
  async execute(_i, ctx) {
    const { data, error } = await db2Admin
      .from("client_automations")
      .select(
        "id,name,automation_type,domain_url,run_state,is_active,expires_at,renewal_at,requires_reinstallation",
      )
      .eq("client_id", clientId(ctx))
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return fail("automations", error);
    return { ok: true, summary: `Found ${data?.length ?? 0} automation(s).`, data: data ?? [] };
  },
});
