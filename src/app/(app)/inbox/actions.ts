"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import { sendText } from "@/modules/whatsapp/send";
import { markConversationRead } from "@/modules/whatsapp/inbox";

const sendTextSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(4096),
});

export async function sendTextAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = sendTextSchema.parse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });

  await sendText(ctx, input);
  revalidatePath(`/inbox/${input.conversationId}`);
}

export async function markReadAction(conversationId: string) {
  const ctx = await requireTenantContext();
  await markConversationRead(ctx, conversationId);
  revalidatePath("/inbox");
}
