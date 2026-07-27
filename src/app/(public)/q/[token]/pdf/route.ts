import { getPublicQuote } from "@/modules/quotes/quotes";
import { generateQuotePdf } from "@/modules/quotes/delivery";

// Serves the quote PDF at a public, unauthenticated URL. This is the URL
// handed to Meta when sending the quote as a WhatsApp document (§8) — Meta
// fetches the file itself, so it cannot require a session.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await getPublicQuote(token);
  if (!resolved) return new Response("Not found", { status: 404 });

  // Rendered on demand rather than served from storage: the stored copy can
  // lag behind edits, and the render is cheap (pure JS, no browser).
  const pdf = await generateQuotePdf(resolved.ctx, resolved.quote.id);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${resolved.quote.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
