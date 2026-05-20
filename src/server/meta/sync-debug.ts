import "server-only";

/**
 * Debug-gated logger for the sync engine.
 *
 * Logs are emitted only when META_SYNC_DEBUG=1 is set in the environment.
 * Use this for verbose progress traces (lock acquired, scope start/done,
 * insights request URL, etc.). Real errors should continue to use
 * console.error directly so they remain visible without the flag.
 *
 * To enable locally:
 *   META_SYNC_DEBUG=1 npm run dev
 */

const ENABLED = process.env.META_SYNC_DEBUG === "1";

export const META_SYNC_DEBUG = ENABLED;

export function debugLog(...args: unknown[]): void {
  if (!ENABLED) return;
  console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (!ENABLED) return;
  console.warn(...args);
}
