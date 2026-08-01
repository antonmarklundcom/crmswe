import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getDocumentByPublicToken } from "@/modules/documents/documents";
import { getContact } from "@/modules/crm/contacts";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { checkRateLimit } from "@/lib/rate-limit";
import type { PaymentState } from "@/modules/documents/types";

// Public read-only nota de venta view (PLAN.md §10 1Q) — the token is the
// secret, same model as the quote link (§8). A voided document stops
// resolving upstream, so this page never shows a cancelled sale as if it
// still stood.

function money(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: currency === "PYG" ? 0 : 2,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amount);
  return `${currency} ${formatted}`;
}

function date(value: Date): string {
  return new Intl.DateTimeFormat("es-PY", { dateStyle: "medium" }).format(value);
}

const STATE_LABEL: Record<PaymentState, string> = {
  unpaid: "Pendiente de pago",
  partial: "Pago parcial",
  paid: "Pagado",
  void: "Anulado",
};

const STATE_CLASS: Record<PaymentState, string> = {
  unpaid: "bg-amber-100 text-amber-900",
  partial: "bg-amber-100 text-amber-900",
  paid: "bg-green-100 text-green-900",
  void: "bg-red-100 text-red-900",
};

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Per-IP limit — the token itself is the secret, so this isn't
  // brute-force defense, it's to keep the page from being hammered.
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  if (checkRateLimit(`document-view:${ip}`, 60, 60_000).limited) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">
        Demasiadas solicitudes. Probá de nuevo en un momento.
      </main>
    );
  }

  const resolved = await getDocumentByPublicToken(token);
  if (!resolved) notFound();

  const { document, items, amountPaid, balance, state, ctx } = resolved;
  const [contact, tenant] = await Promise.all([
    getContact(ctx, document.contactId),
    getTenant(document.tenantId),
  ]);
  const branding = ((tenant?.settings ?? {}) as TenantSettings).branding ?? {};
  const accent = branding.primaryColor || undefined;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied external URL, no loader configured
            <img src={branding.logoUrl} alt={tenant?.name ?? ""} className="max-h-12" />
          ) : (
            <h1 className="text-lg font-semibold" style={{ color: accent }}>
              {tenant?.name}
            </h1>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold" style={{ color: accent }}>
            Nota de venta
          </p>
          <p className="text-sm text-muted-foreground">{document.number}</p>
          <p className="text-sm text-muted-foreground">
            {date(document.issuedAt ?? document.createdAt)}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${STATE_CLASS[state]}`}
          >
            {STATE_LABEL[state]}
          </span>
        </div>
      </header>

      <section className="text-sm">
        <p className="text-muted-foreground">Cliente</p>
        <p>{contact?.name}</p>
        <p className="text-muted-foreground">{contact?.phone}</p>
        {document.dueAt && (
          <p className="mt-2">Vencimiento: {date(document.dueAt)}</p>
        )}
      </section>

      <section>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Descripción</th>
              <th className="py-2 text-right">Cant.</th>
              <th className="py-2 text-right">Precio</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{item.qty}</td>
                <td className="py-2 text-right">
                  {money(item.unitPrice, document.currency)}
                </td>
                <td className="py-2 text-right">
                  {money(item.lineTotal, document.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ml-auto w-full max-w-xs text-sm">
        <div className="flex justify-between py-1">
          <span>Subtotal</span>
          <span>{money(document.subtotal, document.currency)}</span>
        </div>
        {document.discount > 0 && (
          <div className="flex justify-between py-1">
            <span>Descuento</span>
            <span>-{money(document.discount, document.currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t py-1 font-semibold">
          <span>Total</span>
          <span style={{ color: accent }}>{money(document.total, document.currency)}</span>
        </div>
        {amountPaid > 0 && (
          <div className="flex justify-between py-1">
            <span>Pagado</span>
            <span>-{money(amountPaid, document.currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t py-2 font-semibold">
          <span>Saldo</span>
          <span>{money(balance, document.currency)}</span>
        </div>
      </section>

      {document.notes && (
        <section className="text-sm">
          <p className="text-muted-foreground">Notas</p>
          <p className="whitespace-pre-wrap">{document.notes}</p>
        </section>
      )}

      <a
        href={`/d/${token}/pdf`}
        className="w-fit rounded-md border px-4 py-2 text-sm hover:bg-accent"
      >
        Descargar PDF
      </a>

      {/* Shown on the page as well as the PDF: whoever receives this link
          must be able to tell it is not a factura without opening the file. */}
      <p className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">
        Documento no fiscal. Este comprobante no es una factura y no tiene validez
        tributaria.
      </p>
    </main>
  );
}
