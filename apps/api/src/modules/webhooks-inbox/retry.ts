/** Retry schedule (architecture 10.1): about 1 min, 5 min, 15 min, 1 h, then 1 h, each with up to 20% jitter. */
export const RETRY_BASE_MS = [60_000, 300_000, 900_000, 3_600_000, 3_600_000] as const;
export const MAX_JITTER = 0.2;
export const DEFAULT_MAX_ATTEMPTS = 8;

/**
 * Delay before the next attempt, given the number of failed attempts so far (1-based).
 * `random` returns a value in [0, 1); injected so tests are deterministic.
 */
export function nextRetryDelayMs(failedAttempts: number, random: () => number = Math.random): number {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 1) throw new RangeError('failedAttempts must be >= 1');
  const base = RETRY_BASE_MS[Math.min(failedAttempts, RETRY_BASE_MS.length) - 1]!;
  return Math.round(base * (1 + MAX_JITTER * random()));
}

/** True when this many failed attempts means the item must move to DEAD_LETTER. */
export function isDeadLetter(failedAttempts: number, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): boolean {
  return failedAttempts >= maxAttempts;
}
