import { and, eq } from "drizzle-orm";
import { documentSequences } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantTransaction } from "@/modules/tenancy/db";
import { formatSequenceNumber } from "@/modules/renderable-document/format";
import type { DocumentType } from "./types";

// Per-tenant, per-type sequential numbers (PLAN.md §10 1Q), same discipline
// as quote numbering (§8): the counter row is locked FOR UPDATE for the
// read-modify-write, so two documents created at the same instant cannot
// take the same number. The unique index on (tenant_id, number) is the
// backstop if that ever fails.

// Only the *default* for a tenant's first document of a type — the prefix
// then lives on the tenant's own sequence row and can be changed there
// (plan.md §1.13). An existing series never has its prefix rewritten.
const DEFAULT_PREFIX: Record<DocumentType, string> = {
  faktura: "FA",
  kreditfaktura: "KF",
};

export const formatDocumentNumber = formatSequenceNumber;

export async function nextDocumentNumber(
  ctx: TenantContext,
  type: DocumentType,
): Promise<string> {
  return tenantTransaction(ctx, async (tx) => {
    const [existing] = await tx.selectForUpdate(
      documentSequences,
      eq(documentSequences.docType, type),
    );

    if (!existing) {
      // First document of this type for this tenant — seed the counter at 1
      // and take it.
      const prefix = DEFAULT_PREFIX[type];
      await tx
        .insert(documentSequences)
        .values({ id: newId(), docType: type, prefix, nextNumber: 2 });
      return formatSequenceNumber(prefix, 1);
    }

    const value = existing.nextNumber;
    await tx
      .update(documentSequences)
      .set({ nextNumber: value + 1 })
      .where(
        and(
          eq(documentSequences.id, existing.id),
          eq(documentSequences.docType, type),
        ),
      );

    return formatSequenceNumber(existing.prefix, value);
  });
}
