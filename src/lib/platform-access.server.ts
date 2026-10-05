import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { assertAdmin, assertOwner, assertStaff } from "@/lib/rbac.server";

export { assertAdmin, assertOwner, assertStaff };
export { db1Admin, db2Admin, db3Admin, db4Admin };

type LegacyAudit = {
  userId: string;
  action: string;
  targetType: string;
  targetId?: string | null | undefined;
  details?: Record<string, unknown>;
  clientId?: string | null;
};

type ContextAudit = {
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  clientId?: string | null;
};

export async function auditMutation(
  userOrContext: string | { userId: string },
  actionOrInput: string | ContextAudit,
  targetType?: string,
  targetId?: string | null,
  details: Record<string, unknown> = {},
  clientId: string | null = null,
) {
  const actorUserId = typeof userOrContext === "string" ? userOrContext : userOrContext.userId;
  const input: LegacyAudit = typeof actionOrInput === "string"
    ? { userId: actorUserId, action: actionOrInput, targetType: targetType ?? "unknown", targetId, details, clientId }
    : {
        userId: actorUserId,
        action: actionOrInput.action,
        targetType: actionOrInput.targetType,
        targetId: actionOrInput.targetId ?? null,
        details: {
          ...(actionOrInput.metadata ?? {}),
          ...(actionOrInput.reason ? { reason: actionOrInput.reason } : {}),
          ...(actionOrInput.before !== undefined ? { before: actionOrInput.before } : {}),
          ...(actionOrInput.after !== undefined ? { after: actionOrInput.after } : {}),
        },
        clientId: actionOrInput.clientId ?? null,
      };

  const { error } = await db1Admin.from("audit_logs").insert({
    actor_user_id: input.userId,
    client_id: input.clientId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    reason: (input.details as Record<string, unknown> | undefined)?.reason as string | undefined ?? null,
    before_value: (input.details as Record<string, unknown> | undefined)?.before ?? {},
    after_value: (input.details as Record<string, unknown> | undefined)?.after ?? input.details ?? {},
    metadata: input.details ?? {},
  });
  if (error) throw new Error(error.message);
}
