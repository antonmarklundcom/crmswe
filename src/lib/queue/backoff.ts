// Exponential backoff with a cap, deterministic and DB-free so it's cheap to
// unit test in isolation from the worker's MySQL claim loop.
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;

export function backoffDelayMs(attempts: number): number {
  const delay = BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(delay, MAX_DELAY_MS);
}

export function nextRunAt(attempts: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + backoffDelayMs(attempts));
}
