import { AsyncLocalStorage } from "node:async_hooks";

// Better Auth's sendResetPassword hook (server.ts) only ever hands the reset
// URL to sendEmail — there is no return value from
// auth.api.requestPasswordReset() a caller can read it back from. The
// superadmin "restablecer contraseña" action needs that URL on screen (same
// on-screen-link fallback the invite flow already gives — DEPLOY.md §"invites
// /password-reset shown as an on-screen link instead of emailed" — since a
// superadmin resetting a specific member's password already knows the
// account exists, unlike the public /forgot-password timing-safe flow).
//
// AsyncLocalStorage correlates the hook firing back to the request that
// triggered it without a request id threading through Better Auth's own API
// surface, and stays correct across concurrent superadmin requests (each
// gets its own store instance).
const storage = new AsyncLocalStorage<{ url?: string }>();

/** Wraps a call to auth.api.requestPasswordReset(...) and returns the reset
 * URL the sendResetPassword hook captured during it, or null if the hook
 * never fired (e.g. the target email doesn't exist). */
export async function withResetUrlCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; url: string | null }> {
  const store: { url?: string } = {};
  const result = await storage.run(store, fn);
  return { result, url: store.url ?? null };
}

/** Called from the sendResetPassword hook — a no-op outside of
 * withResetUrlCapture's scope, so it's safe for every reset path (the public
 * /forgot-password flow included) to share the same hook implementation. */
export function captureResetUrl(url: string): void {
  const store = storage.getStore();
  if (store) store.url = url;
}
