import { notFound } from "next/navigation";
import { requireTenantContext } from "@/modules/tenancy/context";
import { whatsappEnabledFor } from "@/modules/whatsapp/feature";

// The WhatsApp inbox exists only for a tenant that runs the channel
// (plan.md §5.3.1). The check lives in a layout rather than only in the pages
// beneath it for a reason worth writing down:
//
// `./loading.tsx` puts a Suspense boundary around the page, so Next starts
// streaming the response — status line included — before the page body has
// run. A `notFound()` raised inside the page then renders the 404 *page* into
// an HTTP **200**, which looks right to a human and wrong to anything reading
// the status: a monitor, a crawler, a script. A layout runs outside that
// boundary, so refusing here produces a real 404.
//
// The pages keep their own check. It costs one primary-key lookup and it
// means neither file depends on this one still existing.
export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenantContext();
  if (!(await whatsappEnabledFor(ctx))) notFound();
  return children;
}
