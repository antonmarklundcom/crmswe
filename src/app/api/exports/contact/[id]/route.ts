import { exportContactData } from "@/modules/crm/gdpr";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { apiError, requireSession } from "@/lib/api/guards";

// Registerutdrag for one contact (plan.md §5.3.3; GDPR Article 15).
//
// Session-only — no token lane. The contacts CSV feed next door has one
// because Google's servers fetch it, but this is the whole of one person's
// data in a single document, and an unguessable URL is the wrong credential
// for that: URLs end up in browser history, in chat threads, in server logs.
// Someone has to be logged in and in the tenant.
//
// Read-only, and downloaded rather than rendered: the tenant forwards this
// file to the person who asked for it.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const data = await exportContactData(ctx, id);
  // Scoped by tenantDb, so "not in this tenant" and "does not exist" are the
  // same answer here, which is the answer they should be.
  if (!data) return apiError("not_found", 404);

  // Reading out everything held about a person — org.nr and address included
  // — is exactly the access plan.md §5.3.3 asks to be logged. The audit layer
  // already hooks here; this is the hook.
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: "contact.data_exported",
    entity: "contact",
    entityId: id,
    payload: { basis: "gdpr_article_15" },
  });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Never cached, by us or by anything in front of us.
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="registerutdrag-${id}.json"`,
    },
  });
}
