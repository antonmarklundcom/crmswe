import { eq } from "drizzle-orm";
import { quoteSequences } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantTransaction } from "@/modules/tenancy/db";
import { formatSequenceNumber } from "@/modules/renderable-document/format";

// Per-tenant sequential offert numbers (PLAN.md §8, plan.md §1.13:
// OFF-000123 via quote_sequences in a transaction). The counter row is locked
// FOR UPDATE for the read-modify-write, so two offerter created at the same
// instant cannot take the same number — the unique index on
// (tenant_id, number) is the backstop if that ever fails.

/**
 * Only the *default* for a tenant's first offert — the prefix then lives on
 * the tenant's own sequence row and can be changed there. An existing series
 * never has its prefix rewritten, because a number series may not be renumbered.
 */
export const DEFAULT_QUOTE_PREFIX = "OFF";

export const formatQuoteNumber = formatSequenceNumber;

export async function nextQuoteNumber(ctx: TenantContext): Promise<string> {
  return tenantTransaction(ctx, async (tx) => {
    const [existing] = await tx.selectForUpdate(quoteSequences);

    if (!existing) {
      // First quote for this tenant — seed the counter at 1 and take it.
      await tx.insert(quoteSequences).values({ nextNumber: 2, prefix: DEFAULT_QUOTE_PREFIX });
      return formatSequenceNumber(DEFAULT_QUOTE_PREFIX, 1);
    }

    const value = existing.nextNumber;
    await tx
      .update(quoteSequences)
      .set({ nextNumber: value + 1 })
      .where(eq(quoteSequences.tenantId, ctx.tenantId));

    return formatSequenceNumber(existing.prefix, value);
  });
}
