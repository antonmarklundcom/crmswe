import { eq } from "drizzle-orm";
import { quoteSequences } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantTransaction } from "@/modules/tenancy/db";

// Per-tenant sequential quote numbers (PLAN.md §8: "COT-000123 via
// quote_sequences in a transaction"). The counter row is locked FOR UPDATE
// for the read-modify-write, so two quotes created at the same instant
// cannot take the same number — the unique index on (tenant_id, number) is
// the backstop if that ever fails.

const PAD = 6;

export function formatQuoteNumber(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(PAD, "0")}`;
}

export async function nextQuoteNumber(ctx: TenantContext): Promise<string> {
  return tenantTransaction(ctx, async (tx) => {
    const [existing] = await tx.selectForUpdate(quoteSequences);

    if (!existing) {
      // First quote for this tenant — seed the counter at 1 and take it.
      await tx.insert(quoteSequences).values({ nextNumber: 2, prefix: "COT" });
      return formatQuoteNumber("COT", 1);
    }

    const value = existing.nextNumber;
    await tx
      .update(quoteSequences)
      .set({ nextNumber: value + 1 })
      .where(eq(quoteSequences.tenantId, ctx.tenantId));

    return formatQuoteNumber(existing.prefix, value);
  });
}
