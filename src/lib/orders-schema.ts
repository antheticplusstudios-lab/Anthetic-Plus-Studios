// Adapter between app vocabulary and the REAL DB2 `orders` table.
// Real columns: order_number, product_type (enum automation_product_type), status (enum order_status),
// metadata (jsonb, holds contact/target/payment details). There is NO orders.automation_type column.

/** PostgREST select that exposes legacy names via aliases so UI code keeps working. */
export const ORDER_SELECT =
  "id,client_id,user_id,total_amount,currency,status,created_at,updated_at,rejection_reason,verified_at,metadata," +
  "order_id:order_number,automation_type:product_type,product_name," +
  "target_domain_url:metadata->>target_domain_url,company_name:metadata->>company_name,full_name:metadata->>full_name,contact_email:metadata->>contact_email";

const TO_DB: Record<string, string> = { pending_verification: "awaiting_verification", approved: "verified" };
const FROM_DB: Record<string, string> = { awaiting_verification: "pending_verification", verified: "approved" };
export const orderStatusToDb = (s: string) => TO_DB[s] ?? s;
export const orderStatusFromDb = (s: string) => FROM_DB[s] ?? s;

export function normalizeOrder<T extends Record<string, any>>(row: T): T {
  return row ? ({ ...row, status: orderStatusFromDb(String(row.status)) } as T) : row;
}

export function newOrderNumber() {
  return `AP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
