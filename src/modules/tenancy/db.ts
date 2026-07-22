import { and, eq, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "@/db/client";
import type { TenantContext } from "./context";

// Scoped data access (PLAN.md §3.3, layer 2). Every module service takes a
// TenantContext as its first argument and reaches the database only through
// this wrapper, which auto-injects `eq(table.tenantId, ctx.tenantId)` into
// every read/write. Raw `db` import is lint-banned outside src/db,
// src/worker, and this module (eslint.config.mjs).

type TenantScopedTable = MySqlTable & { tenantId: AnyMySqlColumn };

function tenantFilter<T extends TenantScopedTable>(
  table: T,
  tenantId: string,
  extra?: SQL,
): SQL {
  const scoped = eq(table.tenantId, tenantId);
  return extra ? (and(scoped, extra) as SQL) : scoped;
}

export type TenantDb = ReturnType<typeof tenantDb>;

/**
 * Grace-state write enforcement (PLAN.md §10 1C follow-up #1): every
 * mutating tenant service goes through tenantDb's insert/update/delete, so
 * gating them here is the single choke point — grace/locked tenants become
 * read-only at the write path itself, not just the UI banner.
 */
function assertTenantWritable(ctx: TenantContext): void {
  if (ctx.accessStatus !== "active") {
    throw new Error(
      `Tenant is not writable (accessStatus: ${ctx.accessStatus})`,
    );
  }
}

export function tenantDb(ctx: TenantContext) {
  return {
    /** SELECT ... FROM table WHERE tenant_id = ctx.tenantId [AND extra] */
    select<T extends TenantScopedTable>(table: T, extra?: SQL) {
      return db
        .select()
        .from(table)
        .where(tenantFilter(table, ctx.tenantId, extra));
    },

    /** INSERT INTO table VALUES { ...values, tenant_id: ctx.tenantId } */
    insert<T extends TenantScopedTable>(table: T) {
      return {
        values: (values: Omit<T["$inferInsert"], "tenantId">) => {
          assertTenantWritable(ctx);
          return db.insert(table).values({
            ...values,
            tenantId: ctx.tenantId,
          } as T["$inferInsert"]);
        },
      };
    },

    /** UPDATE table SET values WHERE tenant_id = ctx.tenantId [AND extra] */
    update<T extends TenantScopedTable>(table: T) {
      return {
        set: (values: Partial<T["$inferInsert"]>) => ({
          where: (extra?: SQL) => {
            assertTenantWritable(ctx);
            return db
              .update(table)
              .set(values)
              .where(tenantFilter(table, ctx.tenantId, extra));
          },
        }),
      };
    },

    /** DELETE FROM table WHERE tenant_id = ctx.tenantId [AND extra] */
    delete<T extends TenantScopedTable>(table: T, extra?: SQL) {
      assertTenantWritable(ctx);
      return db.delete(table).where(tenantFilter(table, ctx.tenantId, extra));
    },

    /** Escape hatch for callers building their own query (joins, etc.) that
     * still need the mandatory tenant predicate — never build a WHERE
     * clause on a tenant-owned table without composing this in. */
    where<T extends TenantScopedTable>(table: T, extra?: SQL): SQL {
      return tenantFilter(table, ctx.tenantId, extra);
    },
  };
}
