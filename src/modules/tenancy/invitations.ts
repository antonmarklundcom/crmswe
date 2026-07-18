import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "./context";
import { tenantDb } from "./db";

// Tenant admin invitations (PLAN.md §4: tenant_id, email, role, token,
// expires_at). Creation/listing are tenant-scoped (go through tenantDb);
// looking an invitation up by its token happens *before* the invitee has a
// session (no tenant context yet), so that one read is unavoidably raw —
// allowed here since this file lives in src/modules/tenancy.

const INVITE_TTL_DAYS = 7;

export type CreateInvitationInput = {
  email: string;
  role: "admin" | "agent";
};

export async function createInvitation(
  ctx: TenantContext,
  input: CreateInvitationInput,
) {
  const id = newId();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  await tenantDb(ctx).insert(invitations).values({
    id,
    email: input.email,
    role: input.role,
    token,
    invitedBy: ctx.userId,
    expiresAt,
  });

  return getInvitationById(ctx, id);
}

export function listInvitations(ctx: TenantContext) {
  return tenantDb(ctx).select(invitations);
}

export async function getInvitationById(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(invitations, eq(invitations.id, id));
  return row ?? null;
}

/** Unauthenticated lookup for the accept-invite page — token is the secret. */
export async function getInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token));
  return row ?? null;
}

export async function markInvitationAccepted(invitationId: string) {
  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(invitations.id, invitationId));
}
