import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { newId } from "@/lib/ids";

// Audit trail writer (PLAN.md §3.2, §4). Every impersonated action is
// recorded with both the real actor (impersonatorUserId) and the effective
// user (actorUserId) — this module is one of the few allowed raw-db callers
// (eslint.config.mjs), same as the rest of src/modules/tenancy.

export type AuditEntry = {
  tenantId?: string | null;
  actorUserId: string;
  impersonatorUserId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    id: newId(),
    tenantId: entry.tenantId ?? null,
    actorUserId: entry.actorUserId,
    impersonatorUserId: entry.impersonatorUserId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    payload: entry.payload ?? {},
  });
}

export async function listAuditLogForTenant(tenantId: string, limit = 50) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
