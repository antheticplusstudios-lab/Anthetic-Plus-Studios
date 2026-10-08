// Adapter between the application's order vocabulary and the LIVE DB2 orders table.
// The production table uses order_number/product_type and stores storefront metadata in jsonb.

/** PostgREST select that exposes the legacy UI names without inventing DB columns. */
export const ORDER_SELECT = "*";

const TO_DB: Record<string, string> = {
  pending_verification: "awaiting_verification",
  approved: "verified",
};

const FROM_DB: Record<string, string> = {
  awaiting_verification: "pending_verification",
  verified: "approved",
};

export const orderStatusToDb = (status: string): string => TO_DB[status] ?? status;
export const orderStatusFromDb = (status: string): string => FROM_DB[status] ?? status;

type OrderRowLike = {
  status: string;
  order_number: string;
  product_type: string | null;
  metadata: unknown;
};

function metadataText(metadata: unknown, key: string): string {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function normalizeOrder<T extends OrderRowLike>(row: T) {
  return {
    ...row,
    status: orderStatusFromDb(String(row.status ?? "")),
    order_id: row.order_number,
    automation_type: row.product_type,
    target_domain_url: metadataText(row.metadata, "target_domain_url"),
    company_name: metadataText(row.metadata, "company_name"),
    full_name: metadataText(row.metadata, "full_name"),
    contact_email: metadataText(row.metadata, "contact_email"),
  };
}

export function newOrderNumber(): string {
  return `AP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
