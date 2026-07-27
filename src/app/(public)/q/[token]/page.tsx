import { notFound } from "next/navigation";
import { getPublicQuote } from "@/modules/quotes/quotes";
import { getContact } from "@/modules/crm/contacts";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";

// Public read-only quote view (PLAN.md §8) — the token is the secret, and
// there is deliberately no accept/reject button in Phase 1: the rep sets
// those by hand in the CRM.

function money(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: currency === "PYG" ? 0 : 2,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amount);
  return `${currency} ${formatted}`;
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await getPublicQuote(token);
  if (!resolved) notFound();

  const { quote, items, ctx } = resolved;
  const [contact, tenant] = await Promise.all([
    getContact(ctx, quote.contactId),
    getTenant(quote.tenantId),
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
            PRESUPUESTO
          </p>
          <p className="text-sm text-muted-foreground">{quote.number}</p>
          <p className="text-sm text-muted-foreground">
            {quote.createdAt.toLocaleDateString("es-PY")}
          </p>
        </div>
      </header>

      <section className="text-sm">
        <p className="text-muted-foreground">Cliente</p>
        <p>{contact?.name}</p>
        <p>{contact?.phone}</p>
      </section>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
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
              <td className="py-2 text-right">{money(item.unitPrice, quote.currency)}</td>
              <td className="py-2 text-right">{money(item.lineTotal, quote.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-56 justify-between">
          <span>Subtotal</span>
          <span>{money(quote.subtotal, quote.currency)}</span>
        </div>
        {quote.discount > 0 && (
          <div className="flex w-56 justify-between">
            <span>Descuento</span>
            <span>-{money(quote.discount, quote.currency)}</span>
          </div>
        )}
        <div className="flex w-56 justify-between text-base font-semibold">
          <span>Total</span>
          <span style={{ color: accent }}>{money(quote.total, quote.currency)}</span>
        </div>
      </div>

      {quote.validUntil && (
        <p className="text-sm text-muted-foreground">
          Válido hasta: {quote.validUntil.toLocaleDateString("es-PY")}
        </p>
      )}
      {quote.notes && <p className="text-sm">{quote.notes}</p>}

      <a href={`/q/${token}/pdf`} className="text-sm underline">
        Descargar PDF
      </a>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Documento no fiscal · Factura electrónica próximamente
      </footer>
    </main>
  );
}
