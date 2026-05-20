import "server-only";

/**
 * Meta API rate-limit parsing + abort decision.
 *
 * Parses two response headers Meta returns on every Graph API call:
 *
 *  - x-app-usage:
 *      { "call_count": 35, "total_cputime": 25, "total_time": 35 }
 *      All values are PERCENTAGES (0-100) of Meta's app-level quota.
 *
 *  - x-business-use-case-usage:
 *      { "<bm_id>": [
 *          { "type": "insights",
 *            "call_count": 12,
 *            "total_cputime": 8,
 *            "total_time": 18,
 *            "estimated_time_to_regain_access": 0 },
 *          ...
 *        ] }
 *      call_count/total_cputime/total_time are PERCENTAGES.
 *      estimated_time_to_regain_access is in seconds (0 = no throttle).
 *
 * V1 behavior:
 *   - getRateLimitState(headers) — pure parse, no side effects
 *   - shouldAbortSync(state)     — boolean abort decision
 *
 * No retry / no sleep / no queue in V1. Caller decides what to do.
 */

export type AppUsage = {
  callCount: number;
  cpuTime: number;
  totalTime: number;
};

export type BusinessUsageBucket = {
  bmId: string;
  type: string;
  callCount: number;
  cpuTime: number;
  totalTime: number;
  estimatedTimeToRegainAccessSec: number;
};

export type RateLimitState = {
  appUsage: AppUsage | null;
  businessUsage: BusinessUsageBucket[];
  /** Highest usage percentage across both headers. 0 if no signal. */
  highestUsagePct: number;
  /** Max estimated_time_to_regain_access across business buckets (seconds). */
  estimatedRetryAfterSec: number;
};

type HeadersLike =
  | Headers
  | Record<string, string | undefined>
  | null
  | undefined;

function readHeader(h: HeadersLike, name: string): string | null {
  if (!h) return null;
  if (typeof Headers !== "undefined" && h instanceof Headers) {
    return h.get(name);
  }
  const lower = name.toLowerCase();
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === lower) {
      return (h as Record<string, string | undefined>)[k] ?? null;
    }
  }
  return null;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

type AppUsageRaw = {
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
};

type BusinessUsageRaw = Record<
  string,
  Array<{
    type?: string;
    call_count?: number;
    total_cputime?: number;
    total_time?: number;
    estimated_time_to_regain_access?: number;
  }>
>;

export function getRateLimitState(headers: HeadersLike): RateLimitState {
  const appRaw = parseJson<AppUsageRaw>(readHeader(headers, "x-app-usage"));
  const appUsage: AppUsage | null = appRaw
    ? {
        callCount: num(appRaw.call_count),
        cpuTime: num(appRaw.total_cputime),
        totalTime: num(appRaw.total_time),
      }
    : null;

  const buRaw = parseJson<BusinessUsageRaw>(
    readHeader(headers, "x-business-use-case-usage")
  );

  const businessUsage: BusinessUsageBucket[] = [];
  if (buRaw) {
    for (const [bmId, buckets] of Object.entries(buRaw)) {
      if (!Array.isArray(buckets)) continue;
      for (const b of buckets) {
        businessUsage.push({
          bmId,
          type: b.type ?? "unknown",
          callCount: num(b.call_count),
          cpuTime: num(b.total_cputime),
          totalTime: num(b.total_time),
          estimatedTimeToRegainAccessSec: num(
            b.estimated_time_to_regain_access
          ),
        });
      }
    }
  }

  let highestUsagePct = 0;
  if (appUsage) {
    highestUsagePct = Math.max(
      highestUsagePct,
      appUsage.callCount,
      appUsage.cpuTime,
      appUsage.totalTime
    );
  }
  for (const b of businessUsage) {
    highestUsagePct = Math.max(
      highestUsagePct,
      b.callCount,
      b.cpuTime,
      b.totalTime
    );
  }

  const estimatedRetryAfterSec = businessUsage.reduce(
    (max, b) => Math.max(max, b.estimatedTimeToRegainAccessSec),
    0
  );

  return {
    appUsage,
    businessUsage,
    highestUsagePct,
    estimatedRetryAfterSec,
  };
}

/**
 * Abort threshold (V1): usage >= 95% on any metric, OR Meta returned
 * a positive estimated_time_to_regain_access (explicit throttle).
 *
 * Phase 5 will add backoff between 80%-95% — for V1 we just keep
 * going up to 95% to maximize throughput on the manual sync path.
 */
const ABORT_THRESHOLD_PCT = 95;

export function shouldAbortSync(state: RateLimitState): boolean {
  if (state.highestUsagePct >= ABORT_THRESHOLD_PCT) return true;
  if (state.estimatedRetryAfterSec > 0) return true;
  return false;
}
