import { eq } from "drizzle-orm";
import { messages } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import {
  addTagToContact,
  removeTagFromContact,
  listTagsForContact,
  getContact,
} from "@/modules/crm/contacts";
import { listDealsForContact, moveDeal, assignDeal } from "@/modules/crm/deals";
import { createActivity } from "@/modules/crm/activities";
import { getPrimaryAccount } from "@/modules/whatsapp/accounts";
import { getOrCreateConversation } from "@/modules/whatsapp/inbox";
import { sendText, sendTemplate } from "@/modules/whatsapp/send";
import type { FlowNode } from "./graph";

// Action nodes (PLAN.md §7.1) and the guards every send has to respect (§7.2).

/**
 * Global opt-out (§7.2): a contact tagged `optout` — applied automatically on
 * an inbound BAJA/STOP — is skipped by every send action. Checked here, in
 * the one place all automated sends pass through, rather than at each call
 * site where it could be forgotten.
 */
export const OPTOUT_TAG = "optout";

export type ActionResult = { skipped: boolean; detail: Record<string, unknown> };

export async function hasOptedOut(ctx: TenantContext, contactId: string): Promise<boolean> {
  const tags = await listTagsForContact(ctx, contactId);
  return tags.some((tag) => tag.name.toLowerCase() === OPTOUT_TAG);
}

export async function executeAction(
  ctx: TenantContext,
  node: Extract<FlowNode, { type: "action" }>,
  contactId: string,
  runId: string,
): Promise<ActionResult> {
  const config = node.config as Record<string, unknown>;
  const kind = String(config.kind);

  if (kind === "send_whatsapp" || kind === "send_template") {
    if (await hasOptedOut(ctx, contactId)) {
      return { skipped: true, detail: { reason: "contact_opted_out" } };
    }
    return sendWhatsappAction(ctx, kind, config, contactId, runId);
  }

  switch (kind) {
    case "add_tag":
      await addTagToContact(ctx, contactId, String(config.tagId));
      return { skipped: false, detail: { tagId: config.tagId } };

    case "remove_tag":
      await removeTagFromContact(ctx, contactId, String(config.tagId));
      return { skipped: false, detail: { tagId: config.tagId } };

    case "move_deal_stage": {
      const deals = await listDealsForContact(ctx, contactId);
      const deal = deals[0];
      if (!deal) return { skipped: true, detail: { reason: "no_deal" } };
      await moveDeal(ctx, deal.id, { toStageId: String(config.stageId), toPosition: 0 });
      return { skipped: false, detail: { dealId: deal.id, stageId: config.stageId } };
    }

    case "assign_user": {
      const deals = await listDealsForContact(ctx, contactId);
      const deal = deals[0];
      if (!deal) return { skipped: true, detail: { reason: "no_deal" } };
      await assignDeal(ctx, deal.id, String(config.userId));
      return { skipped: false, detail: { dealId: deal.id, userId: config.userId } };
    }

    case "create_note":
      await createActivity(ctx, {
        contactId,
        type: "note",
        payload: { text: String(config.text ?? ""), automationRunId: runId },
      });
      return { skipped: false, detail: {} };

    default:
      return { skipped: true, detail: { reason: `unknown_action:${kind}` } };
  }
}

async function sendWhatsappAction(
  ctx: TenantContext,
  kind: string,
  config: Record<string, unknown>,
  contactId: string,
  runId: string,
): Promise<ActionResult> {
  const account = await getPrimaryAccount(ctx);
  if (!account) return { skipped: true, detail: { reason: "no_whatsapp_account" } };

  const conversation = await getOrCreateConversation(ctx, account.id, contactId);
  if (!conversation) return { skipped: true, detail: { reason: "no_conversation" } };

  if (kind === "send_template") {
    const messageId = await sendTemplate(ctx, {
      conversationId: conversation.id,
      templateName: String(config.templateName),
      language: String(config.language ?? "es"),
    });
    await stampAutomationRun(ctx, messageId, runId);
    return { skipped: false, detail: { messageId, template: config.templateName } };
  }

  // Free-form sends are only legal inside the 24h window (§6.4). Outside it
  // this is a skip with a reason, not a failed run — the flow should carry
  // on to whatever comes next rather than dying.
  try {
    const messageId = await sendText(ctx, {
      conversationId: conversation.id,
      body: renderTemplateVars(String(config.text ?? ""), await getContact(ctx, contactId)),
    });
    await stampAutomationRun(ctx, messageId, runId);
    return { skipped: false, detail: { messageId } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ventana de 24 horas")) {
      return { skipped: true, detail: { reason: "window_closed" } };
    }
    throw err;
  }
}

/**
 * Every automated send is a `messages` row carrying automation_run_id, so it
 * shows up in the inbox like any other message and is traceable back to the
 * run that produced it (§7.2).
 */
async function stampAutomationRun(ctx: TenantContext, messageId: string, runId: string) {
  await tenantDb(ctx)
    .update(messages)
    .set({ automationRunId: runId })
    .where(eq(messages.id, messageId));
}

/** Minimal {{contact.name}} / {{contact.phone}} substitution (§7.1). */
export function renderTemplateVars(
  text: string,
  contact: { name: string; phone: string } | null,
): string {
  if (!contact) return text;
  return text
    .replaceAll("{{contact.name}}", contact.name)
    .replaceAll("{{contact.phone}}", contact.phone);
}
