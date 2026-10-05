export type Profile = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  client_id: string | null;
  default_organization_id: string | null;
  company_name: string;
  company_email: string;
  website_url: string;
  category: string;
  profile_completed: boolean;
  registered_origin_domain: string | null;
  created_at: string;
  updated_at: string;
};

export type Instance = {
  id: string; client_id: string; order_id: string | null; automation_type: string; automation_slug: string;
  name: string; domain_url: string; website_domain: string; assigned_phone_number: string | null;
  run_state: string; is_active: boolean; status: string; killed: boolean; requires_reinstallation: boolean;
  widget_config: Record<string, unknown>; expires_at: string | null; renewal_at: string | null;
  billing_plan: string; subscription_status: string | null; subscription_expires_at: string | null;
  conversations_count: number; leads_count: number; business_context: string; system_prompt: string;
  script_token: string; warning_sent: boolean; grace_days: number; created_at: string;
};

export type Payment = {
  id: string; order_id: string; automation_id: string | null; automation_slug: string; billing_plan: string;
  amount: number; currency: string; payment_method: string; transaction_id: string; sender_name: string;
  rejection_reason: string | null; payment_status: string; status: string; submitted_at: string; created_at: string; payment_id: string | null;
  target_domain_url?: string; total_amount?: number;
};

export type AppRole = "client" | "verifier" | "partner" | "owner" | "admin";

export const WIDGET_CDN = "https://cdn.antheticplus.ai/widget.js";

export function scriptTag(instance: Pick<Instance, "id" | "script_token" | "client_id">) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `<script src="${base}/widget.js" data-client-id="${instance.client_id ?? ""}" data-automation-id="${instance.id}" data-token="${instance.script_token}" defer></script>`;
}

export function daysRemaining(expiresAt: string | null) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function isLive(instance: Instance) {
  return (instance.status === "paid" || instance.status === "active") && !instance.killed && daysRemaining(instance.expires_at) > 0;
}

export const statusLabels: Record<string, string> = {
  paid: "Paid · Awaiting setup",
  active: "Active",
  pending_payment: "Pending Verification",
  stopped: "Stopped",
  revoked: "Revoked",
  suspended: "Suspended",
  pending: "Pending Verification",
  approved: "Approved",
  rejected: "Rejected",
};

export function statusClass(status: string) {
  switch (status) {
    case "paid":
    case "active":
    case "approved":
      return "bg-success/12 text-success";
    case "pending_payment":
    case "pending":
      return "bg-foreground/12 text-foreground";
    case "rejected":
    case "revoked":
    case "suspended":
      return "bg-destructive/12 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export const paymentMethods = ["Crypto (USDT / BTC)", "Bank transfer", "Mobile money"] as const;

export function hostFromUrl(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]!
    .toLowerCase();
}
