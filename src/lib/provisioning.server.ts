import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createHash, randomBytes } from "node:crypto";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { safeFetch } from "@/lib/safe-fetch.server";
import type { DB2Database } from "@/server/db/server-db.types";

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function crawl(domain: string) {
  const url = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
  try {
    const fetched = await safeFetch(url, {
      headers: { "User-Agent": "AntheticPlusBot/2.0" },
      signal: AbortSignal.timeout(10000),
    });
    const res = fetched.response;
    if (!res.ok) return { ok: false, url, text: "", title: "" };
    const html = await res.text();
    return {
      ok: true,
      url: fetched.url,
      title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "",
      text: htmlToText(html).slice(0, 50000),
    };
  } catch {
    return { ok: false, url, text: "", title: "" };
  }
}

function monthEndsFrom(base: Date) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}

async function ensureSubscription(
  clientId: string,
  automationId: string,
  productType: string,
  orderId: string,
  recurringAmount: number,
  setupFee: number,
  planCode: string,
) {
  const { data: automation } = await db2Admin
    .from("client_automations")
    .select("subscription_id")
    .eq("id", automationId)
    .maybeSingle();
  const now = new Date();
  const periodDays = planCode === "yearly" ? 365 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 86400000).toISOString();
  const graceEnd = new Date(new Date(periodEnd).getTime() + 7 * 86400000).toISOString();
  const base = {
    client_id: clientId,
    order_id: orderId,
    product_type: productType,
    plan_code: planCode,
    amount: recurringAmount,
    currency: "USD",
    billing_interval: planCode === "yearly" ? "yearly" : "monthly",
    started_at: now.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: periodEnd,
    renewal_at: periodEnd,
    grace_period_end: graceEnd,
    status: "active",
    auto_renew: true,
    metadata: {
      billing_starts_after_setup: true,
      setup_fee_paid: setupFee,
      recurring_amount: recurringAmount,
      first_payment_due_at: periodEnd,
    },
  };

  if (automation?.subscription_id) {
    const { data, error } = await db2Admin
      .from("subscriptions")
      .update({
        ...base,
        updated_at: now.toISOString(),
        grace_period_start: periodEnd,
        cancelled_at: null,
        cancellation_reason: null,
        expired_at: null,
        suspended_at: null,
      })
      .eq("id", automation.subscription_id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not reactivate subscription");
    await db2Admin
      .from("client_automations")
      .update({
        subscription_id: data.id,
        renewal_at: data.renewal_at,
        expires_at: data.current_period_end,
      })
      .eq("id", automationId);
    return data;
  }

  const { data, error } = await db2Admin.from("subscriptions").insert(base).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create subscription");
  await db2Admin
    .from("client_automations")
    .update({
      subscription_id: data.id,
      renewal_at: data.renewal_at,
      expires_at: data.current_period_end,
    })
    .eq("id", automationId);
  return data;
}

async function ensureCrmAndAi(
  clientId: string,
  automationId: string,
  order: {
    company_name: string;
    full_name: string;
    target_domain_url: string;
    contact_email: string;
  },
) {
  const company = order.company_name || order.full_name;
  const website = order.target_domain_url;
  const email = order.contact_email;
  const { error: crmError } = await db4Admin.from("crm_clients").upsert(
    {
      id: clientId,
      company_name: company,
      website_url: website,
      category: "",
      primary_email: email,
      status: "active",
    },
    { onConflict: "id" },
  );
  if (crmError) throw new Error(crmError.message);
  const { error: aiError } = await db3Admin.from("ai_configs").upsert(
    {
      automation_id: automationId,
      client_id: clientId,
      primary_provider: "openai",
      primary_model: "gpt-5-mini",
      system_prompt: "",
      behavior_config: {
        business_context: `Business: ${company || "Client"}\nWebsite: ${website}`,
      },
      status: "active",
      fallback_providers: [],
    },
    { onConflict: "automation_id" },
  );
  if (aiError) throw new Error(aiError.message);
}

export async function runProvisioningPipeline(
  paymentVerificationId: string,
  actorId: string,
  origin: string,
) {
  const { data: pay, error: payError } = await db2Admin
    .from("payment_verifications")
    .select("id,order_id,status")
    .eq("id", paymentVerificationId)
    .single();
  if (payError || !pay || pay.status !== "approved")
    throw new Error("Approved payment verification not found");

  const { data: order, error: orderError } = await db2Admin
    .from("orders")
    .select("*")
    .eq("id", pay.order_id)
    .single();
  if (orderError || !order) throw new Error("Order not found");
  const orderDetails = normalizeOrder(order);
  const clientId = String(order.client_id);
  const productType = String(orderDetails.automation_type ?? "");
  if (!productType) throw new Error("Order has no product type");
  const metadata =
    order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
      ? (order.metadata as Record<string, unknown>)
      : {};
  const pricing =
    metadata.pricing_snapshot &&
    typeof metadata.pricing_snapshot === "object" &&
    !Array.isArray(metadata.pricing_snapshot)
      ? (metadata.pricing_snapshot as Record<string, unknown>)
      : {};
  const planCode = String(pricing.plan ?? "monthly");
  const company = orderDetails.company_name || orderDetails.full_name || "AntheticPlus Automation";
  const targetDomain = orderDetails.target_domain_url;

  const initialAutomation = await db2Admin
    .from("client_automations")
    .select(
      "id,client_id,product_type,automation_type,domain_url,script_token_last4,widget_config,subscription_id,expires_at,renewal_at",
    )
    .eq("metadata->>order_id", order.id)
    .maybeSingle();
  const instError = initialAutomation.error;
  let inst = initialAutomation.data;
  if (instError) throw new Error(instError.message);

  if (!inst) {
    const slug = `${productType}-${String(order.id).slice(0, 8)}`;
    const { data: created, error } = await db2Admin
      .from("client_automations")
      .insert({
        client_id: clientId,
        owner_user_id: order.user_id ?? null,
        product_type: productType,
        name: company,
        slug,
        company_name: company,
        domain: targetDomain,
        status: "provisioning",
        health: "unknown",
        enabled: false,
        environment: "production",
        metadata: { order_id: order.id },
        config: { settings: (metadata.configuration ?? {}) as Record<string, string> },
        client_name: company,
        automation_name: company,
        product_name: String(order.product_name ?? productType),
        run_state: "provisioning",
        installation_status: "provisioning",
        health_status: "unknown",
        automation_type: productType,
        domain_url: targetDomain,
        allowed_domains: targetDomain ? [targetDomain] : [],
        is_active: false,
        requires_reinstallation: true,
        script_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        script_token_last4: "",
      })
      .select(
        "id,client_id,product_type,automation_type,domain_url,script_token_last4,widget_config,subscription_id,expires_at,renewal_at",
      )
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create automation");
    inst = created;
  }

  const recurringAmount = Number(
    pricing.recurring_amount ?? pricing.base ?? order.total_amount ?? 0,
  );
  const setupFee = Number(pricing.setup_fee ?? order.total_amount ?? 0);
  const subscription = await ensureSubscription(
    clientId,
    String(inst.id),
    productType,
    String(order.id),
    recurringAmount,
    setupFee,
    planCode,
  );
  await ensureCrmAndAi(clientId, String(inst.id), orderDetails);

  const { data: token, error: tokenError } = await db2Admin.rpc("generate_automation_token", {
    p_automation_id: inst.id,
    p_generated_by: actorId,
  });
  if (tokenError || !token)
    throw new Error(tokenError?.message ?? "Could not generate installation token");
  const rawToken = String(token);

  const page = await crawl(targetDomain);
  const { data: knowledgeBase, error: kbError } = await db3Admin
    .from("knowledge_bases")
    .upsert(
      {
        client_id: clientId,
        automation_id: inst.id,
        name: `${company} Knowledge`,
        status: "active",
      },
      { onConflict: "automation_id" },
    )
    .select("id")
    .single();
  if (kbError) throw new Error(kbError.message);

  if (page.ok && page.text && knowledgeBase) {
    const checksum = createHash("sha256").update(page.text).digest("hex");
    await db3Admin
      .from("kb_documents")
      .update({ status: "canceled" })
      .eq("automation_id", inst.id)
      .eq("source_type", "website_url")
      .eq("status", "completed");
    const { data: doc, error: docError } = await db3Admin
      .from("kb_documents")
      .insert({
        knowledge_base_id: knowledgeBase.id,
        client_id: clientId,
        automation_id: inst.id,
        source_type: "website_url",
        source_name: page.title || page.url,
        canonical_url: page.url,
        checksum,
        content: page.text,
        priority: 100,
        status: "processing",
        metadata: { provisioned_by: actorId },
      })
      .select("id")
      .single();
    if (!docError && doc) {
      const { indexKnowledgeDocument } = await import("./rag.server");
      const indexed = await indexKnowledgeDocument(String(doc.id));
      await db3Admin
        .from("kb_documents")
        .update({
          status: indexed.embedded > 0 ? "completed" : "error",
          error: indexed.embedded > 0 ? null : "No embedding provider available",
        })
        .eq("id", doc.id);
      await db3Admin.from("crawl_jobs").insert({
        client_id: clientId,
        automation_id: inst.id,
        knowledge_base_id: knowledgeBase.id,
        target_url: page.url,
        status: indexed.embedded > 0 ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        last_error: indexed.embedded > 0 ? null : "No embedding provider available",
        metadata: {
          pages_crawled: 1,
          characters_ingested: page.text.length,
          chunks: indexed.count,
          embedded: indexed.embedded,
        },
      });
    }
  } else {
    await db3Admin.from("crawl_jobs").insert({
      client_id: clientId,
      automation_id: inst.id,
      target_url: targetDomain,
      status: "failed",
      last_error: "Could not crawl target site",
      metadata: {},
    });
  }

  const expires = String(subscription.current_period_end);
  const { error: automationUpdateError } = await db2Admin
    .from("client_automations")
    .update({
      subscription_id: subscription.id,
      status: "testing",
      health: "unknown",
      enabled: false,
      // Provisioned deployments remain non-live until a successful test and explicit admin activation.
      run_state: "testing",
      is_active: false,
      requires_reinstallation: false,
      renewal_at: subscription.renewal_at,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inst.id);
  if (automationUpdateError) throw new Error(automationUpdateError.message);

  const { error: outboxError } = await db2Admin.rpc("enqueue_outbox", {
    p_event_type: "automation.created",
    p_aggregate_type: "automation",
    p_aggregate_id: inst.id,
    p_idempotency_key: `automation.created:${inst.id}`,
    p_payload: { client_id: clientId, automation_id: inst.id },
  });
  if (outboxError) throw new Error(outboxError.message);
  await auditMutation(
    actorId,
    "automation.provisioned",
    "automation",
    inst.id,
    { paymentVerificationId, crawled: page.ok, url: page.url },
    clientId,
  );
  const base = origin.replace(/\/$/, "");
  const snippet = `<script src="${base}/widget.js" data-client-id="${clientId}" data-automation-id="${inst.id}" data-token="${rawToken}" defer></script>`;
  return {
    crawled: page.ok,
    snippet,
    automationId: inst.id,
    crawlUrl: page.url,
    crawlChars: page.text.length,
    scriptToken: rawToken,
  };
}
