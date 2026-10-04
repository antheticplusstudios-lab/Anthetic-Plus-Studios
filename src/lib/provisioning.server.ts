import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createHash, randomBytes } from "node:crypto";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { safeFetch } from "@/lib/safe-fetch.server";

function htmlToText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export async function crawl(domain: string) {
  const url = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
  try {
    const fetched = await safeFetch(url, { headers: { "User-Agent": "AntheticPlusBot/2.0" }, signal: AbortSignal.timeout(10000) });
    const res = fetched.response;
    if (!res.ok) return { ok: false, url, text: "", title: "" };
    const html = await res.text();
    return { ok: true, url: fetched.url, title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "", text: htmlToText(html).slice(0, 50000) };
  } catch { return { ok: false, url, text: "", title: "" }; }
}

function monthEndsFrom(base: Date) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}

async function ensureSubscription(clientId: string, automationId: string, planSlug: string) {
  const { data: existing } = await db2Admin.from("subscriptions").select("*").eq("automation_id", automationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const now = new Date().toISOString();
  const expires = monthEndsFrom(new Date());
  const grace = new Date(new Date(expires).getTime() + 7 * 86400000).toISOString();
  if (existing) {
    const { data, error } = await db2Admin.from("subscriptions").update({ client_id: clientId, plan_slug: planSlug, status: "active", renewal_at: expires, expires_at: expires, grace_period_end: grace, cancel_at: null, canceled_at: null, updated_at: now }).eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Could not reactivate subscription");
    await db2Admin.from("client_automations").update({ subscription_id: data.id, renewal_at: data.renewal_at, expires_at: data.expires_at }).eq("id", automationId);
    return data;
  }
  const { data, error } = await db2Admin.from("subscriptions").insert({ client_id: clientId, automation_id: automationId, plan_slug: planSlug, status: "active", started_at: now, renewal_at: expires, expires_at: expires, grace_period_end: grace, provider: "manual" }).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create subscription");
  await db2Admin.from("client_automations").update({ subscription_id: data.id, renewal_at: data.renewal_at, expires_at: data.expires_at }).eq("id", automationId);
  return data;
}

async function ensureCrmAndAi(clientId: string, automationId: string, order: any) {
  await db4Admin.from("crm_clients").upsert({ id: clientId, company_name: order.company_name || order.full_name || "", website_url: order.target_domain_url || "", primary_email: order.contact_email || "", status: "active" }, { onConflict: "id" });
  await db3Admin.from("ai_configs").upsert({ automation_id: automationId, client_id: clientId, primary_provider: "openai", primary_model: "gpt-5-mini", system_prompt: "", behavior_config: { business_context: `Business: ${order.company_name || order.full_name || "Client"}\nWebsite: ${order.target_domain_url}` }, status: "active" }, { onConflict: "automation_id" });
}

export async function runProvisioningPipeline(paymentVerificationId: string, actorId: string, origin: string) {
  const { data: pay, error: payError } = await db2Admin.from("payment_verifications").select("id,order_id,client_id,status").eq("id", paymentVerificationId).single();
  if (payError || !pay || pay.status !== "approved") throw new Error("Approved payment verification not found");
  const { data: order } = await db2Admin.from("orders").select(ORDER_SELECT as "*").eq("id", pay.order_id).single();
  if (!order) throw new Error("Order not found");

  let { data: inst } = await db2Admin.from("client_automations").select("id,client_id,automation_type,domain_url,script_token_last4,widget_config,subscription_id").eq("metadata->>order_id", order.id).maybeSingle();
  if (!inst) {
    const { data: created, error } = await db2Admin.from("client_automations").insert({
      client_id: pay.client_id,
      product_type: order.automation_type,
      automation_type: order.automation_type,
      slug: `${order.automation_type}-${String(order.id).slice(0, 8)}`,
      status: "active",
      metadata: { order_id: order.id },
      name: order.company_name || order.full_name || "AntheticPlus Automation",
      domain_url: order.target_domain_url,
      allowed_domains: [order.target_domain_url],
      run_state: "active",
      is_active: true,
      script_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      script_token_last4: "",
    }).select("id,client_id,automation_type,domain_url,script_token_last4,widget_config,subscription_id").single();
    if (error || !created) throw new Error(error?.message ?? "Could not create automation");
    inst = created;
  }

  const subscription = await ensureSubscription(String(pay.client_id), String(inst.id), String(order.automation_type));
  await ensureCrmAndAi(String(pay.client_id), String(inst.id), order);

  const { data: token, error: tokenError } = await db2Admin.rpc("generate_automation_token", { p_automation_id: inst.id, p_generated_by: actorId });
  if (tokenError || !token) throw new Error(tokenError?.message ?? "Could not generate installation token");
  const rawToken = String(token);

  const page = await crawl(order.target_domain_url);
  const knowledgeBase = await db3Admin.from("knowledge_bases").upsert({ client_id: pay.client_id, automation_id: inst.id, name: `${order.company_name || "Automation"} Knowledge`, status: "active" }, { onConflict: "automation_id" }).select("id").single();
  if (page.ok && page.text && knowledgeBase.data) {
    const checksum = createHash("sha256").update(page.text).digest("hex");
    await db3Admin.from("kb_documents").update({ status: "canceled" }).eq("automation_id", inst.id).eq("source_type", "website_url").eq("status", "completed");
    const { data: doc, error: docError } = await db3Admin.from("kb_documents").insert({ knowledge_base_id: knowledgeBase.data.id, client_id: pay.client_id, automation_id: inst.id, source_type: "website_url", source_name: page.title || page.url, canonical_url: page.url, checksum, content: page.text, priority: 100, status: "processing", metadata: { provisioned_by: actorId } }).select("id").single();
    if (!docError && doc) {
      const { indexKnowledgeDocument } = await import("./rag.server");
      const indexed = await indexKnowledgeDocument(String(doc.id));
      await db3Admin.from("kb_documents").update({ status: indexed.embedded > 0 ? "completed" : "error", error: indexed.embedded > 0 ? null : "No embedding provider available" }).eq("id", doc.id);
      await db3Admin.from("crawl_jobs").insert({ client_id: pay.client_id, automation_id: inst.id, knowledge_base_id: knowledgeBase.data.id, target_url: page.url, status: indexed.embedded > 0 ? "completed" : "failed", completed_at: new Date().toISOString(), last_error: indexed.embedded > 0 ? null : "No embedding provider available", metadata: { pages_crawled: 1, characters_ingested: page.text.length, chunks: indexed.count, embedded: indexed.embedded } });
    }
  } else {
    await db3Admin.from("crawl_jobs").insert({ client_id: pay.client_id, automation_id: inst.id, target_url: order.target_domain_url, status: "failed", last_error: "Could not crawl target site" });
  }

  const expires = String(subscription.expires_at ?? monthEndsFrom(new Date()));
  await db2Admin.from("client_automations").update({ subscription_id: subscription.id, run_state: "active", is_active: true, requires_reinstallation: false, renewal_at: expires, expires_at: expires }).eq("id", inst.id);
  await db2Admin.rpc("enqueue_outbox", { p_event_type: "automation.created", p_aggregate_type: "automation", p_aggregate_id: inst.id, p_idempotency_key: `automation.created:${inst.id}`, p_payload: { client_id: pay.client_id, automation_id: inst.id } });
  await auditMutation(actorId, "automation.provisioned", "automation", inst.id, { paymentVerificationId, crawled: page.ok, url: page.url }, String(pay.client_id));
  const base = origin.replace(/\/$/, "");
  const snippet = `<script src="${base}/widget.js" data-client-id="${pay.client_id}" data-automation-id="${inst.id}" data-token="${rawToken}" defer></script>`;
  return { crawled: page.ok, snippet, automationId: inst.id, crawlUrl: page.url, crawlChars: page.text.length, scriptToken: rawToken };
}
