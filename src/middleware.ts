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
const PUBLIC_PREFIXES = [
  "/login",
  "/accept-invite",
  "/forgot-password",
  "/reset-password",
  "/api",
  "/f/",
  "/q/",
];

// Exact public paths, kept separate from the prefixes above so this stays a
// narrow allowlist rather than "anything under /vc-*". The attribution
// snippet (§5.1) is loaded by connected sites' visitors, who by definition
// have no session here — without this it would be redirected to /login.
const PUBLIC_EXACT = ["/vc-attribution.js"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
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
