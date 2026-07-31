import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Fast, edge-safe gate: presence of a session cookie only (no DB call, no
// tenant context — mysql2 isn't edge-runtime safe). Real tenant-context
// resolution, role checks, and the suspension/expiry access-status check
// (grace/locked) happen server-side in the (app) and (superadmin) layouts,
// which run in the Node.js runtime and can reach the tenancy module.
// Known public surface (PLAN.md §2.2 `(public)`/`(auth)` route groups +
// api/webhooks). Route groups like (app)/(superadmin) don't add a URL
// prefix, so we can't matcher-match on "/app/*" — instead this list is
// checked in code against the actual pathname, failing closed (protect)
// for anything not explicitly listed here.
export const PUBLIC_PREFIXES = [
  "/login",
  "/accept-invite",
  "/forgot-password",
  "/reset-password",
  "/api",
  "/f/",
  "/q/",
  // Public nota de venta view + PDF (§10 1Q). The /pdf path in particular
  // is fetched by *Meta* when delivering the document over WhatsApp, so a
  // redirect to /login here doesn't look like an auth bug — it looks like
  // WhatsApp silently not delivering attachments.
  "/d/",
];

// Exact public paths, kept separate from the prefixes above so this stays a
// narrow allowlist rather than "anything under /vc-*". The attribution
// snippet (§5.1) is loaded by connected sites' visitors, who by definition
// have no session here — without this it would be redirected to /login.
export const PUBLIC_EXACT = ["/vc-attribution.js"];

/**
 * Extracted and exported so the allowlist is unit-testable without booting
 * Next. Every public surface that an *external* system fetches (Meta pulling
 * a PDF, a site visitor loading a form) fails closed if it's missing from
 * the lists above, and fails in a way that looks like a different bug —
 * so it gets a test rather than trust.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = !!getSessionCookie(request);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
