// Stand-in for src/worker/index.ts in the Edge webpack bundle only (see
// next.config.ts). instrumentation.ts's `register()` never actually calls
// startWorker() on Edge (its own `NEXT_RUNTIME !== "nodejs"` guard returns
// first), but webpack still needs *something* resolvable to satisfy the
// dynamic import when building the Edge variant of instrumentation — mysql2
// and Node builtins (crypto/tls/etc.) the real worker pulls in aren't
// Edge-compatible. This stub is never invoked.
export function startWorker(): () => void {
  throw new Error("startWorker is not available in the Edge runtime");
}

export async function tick(): Promise<boolean> {
  throw new Error("tick is not available in the Edge runtime");
}
