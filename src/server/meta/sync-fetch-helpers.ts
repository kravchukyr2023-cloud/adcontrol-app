import "server-only";
import {
  getRateLimitState,
  shouldAbortSync,
  type RateLimitState,
} from "./rate-limit";
import {
  MAX_RETRY_ATTEMPTS,
  MAX_SYNC_PAGES_PER_SCOPE,
  PAGINATION_TIMEOUT_PER_PAGE_MS,
  RETRY_BACKOFF_BASE_MS,
} from "./sync-constants";

/**
 * Shared Meta paginated GET helper used by all fetchers.
 *
 * Layer rules (per Phase 2 architecture):
 *   - Only HTTP I/O + pagination + response parsing.
 *   - No Supabase, no events, no sync_states writes, no project context.
 *
 * Aborts gracefully on:
 *   - Pagination cap          → 'truncated'
 *   - External AbortSignal    → 'signal'
 *   - Runtime deadline        → 'runtime'
 *   - Rate-limit headers ≥95% → 'rate_limited'
 *   - HTTP non-OK / Meta error / network failure → 'fetch_error' | 'meta_error'
 *   - JSON parse failure      → 'parse_error'
 *
 * Returns whatever rows it managed to fetch before the abort along with the
 * reason. Caller (sync engine) decides what to do with partial data.
 */

export type AbortReason =
  | "truncated"
  | "signal"
  | "runtime"
  | "rate_limited"
  | "fetch_error"
  | "meta_error"
  | "parse_error";

export type PaginatedResult<T> = {
  data: T[];
  abortReason: AbortReason | null;
  errorMessage: string | null;
  rateLimitState: RateLimitState | null;
  pagesFetched: number;
};

export type PaginatedFetchOptions<TPageItem, TOut> = {
  /** Fully-built first-page URL including ?access_token=… and all params. */
  initialUrl: string;
  /** Optional override of MAX_SYNC_PAGES_PER_SCOPE for this call. */
  maxPages?: number;
  /** External cancellation (e.g., from the sync engine). */
  signal?: AbortSignal;
  /** Date.now() target — abort gracefully if exceeded between pages. */
  deadline?: number;
  /** Per-item transform from raw Meta row → typed output row. */
  mapItem: (raw: TPageItem) => TOut;
  /** Label used in structured error logs, e.g. "campaigns" / "ad_insights". */
  scope?: string;
};

type MetaPagedResponse<T> = {
  data?: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: {
    message?: string;
    code?: number;
    type?: string;
    error_subcode?: number;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
};

type MetaErrorInfo = {
  message: string | null;
  code: number | null;
  error_subcode: number | null;
  type: string | null;
  fbtrace_id: string | null;
  error_user_title: string | null;
  error_user_msg: string | null;
};

function scrubAccessToken(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("access_token")) {
      u.searchParams.set("access_token", "REDACTED");
    }
    return u.toString();
  } catch {
    return url.replace(/([?&])access_token=[^&]*/g, "$1access_token=REDACTED");
  }
}

function parseMetaErrorBody(body: string): MetaErrorInfo | null {
  if (!body) return null;
  try {
    const j = JSON.parse(body) as MetaPagedResponse<unknown>;
    if (j.error && typeof j.error === "object") {
      return extractMetaError(j.error);
    }
  } catch {
    // not JSON
  }
  return null;
}

function extractMetaError(
  err: NonNullable<MetaPagedResponse<unknown>["error"]>
): MetaErrorInfo {
  return {
    message: typeof err.message === "string" ? err.message : null,
    code: typeof err.code === "number" ? err.code : null,
    error_subcode:
      typeof err.error_subcode === "number" ? err.error_subcode : null,
    type: typeof err.type === "string" ? err.type : null,
    fbtrace_id: typeof err.fbtrace_id === "string" ? err.fbtrace_id : null,
    error_user_title:
      typeof err.error_user_title === "string" ? err.error_user_title : null,
    error_user_msg:
      typeof err.error_user_msg === "string" ? err.error_user_msg : null,
  };
}

function formatMetaErrorMessage(opts: {
  status: number;
  statusText: string;
  scrubbedUrl: string;
  bodyText: string;
  meta: MetaErrorInfo | null;
}): string {
  const parts: string[] = [];
  parts.push(`HTTP ${opts.status} ${opts.statusText || ""}`.trim());
  parts.push(`url=${opts.scrubbedUrl}`);
  if (opts.meta) {
    if (opts.meta.message) parts.push(`message="${opts.meta.message}"`);
    if (opts.meta.code !== null) parts.push(`code=${opts.meta.code}`);
    if (opts.meta.error_subcode !== null)
      parts.push(`subcode=${opts.meta.error_subcode}`);
    if (opts.meta.type) parts.push(`type=${opts.meta.type}`);
    if (opts.meta.fbtrace_id)
      parts.push(`fbtrace_id=${opts.meta.fbtrace_id}`);
    if (opts.meta.error_user_title)
      parts.push(`user_title="${opts.meta.error_user_title}"`);
    if (opts.meta.error_user_msg)
      parts.push(`user_msg="${opts.meta.error_user_msg}"`);
  } else if (opts.bodyText) {
    parts.push(`body=${opts.bodyText.slice(0, 500)}`);
  }
  return parts.join(" | ");
}

function logMetaApiError(opts: {
  scope: string;
  status: number;
  meta: MetaErrorInfo | null;
  scrubbedUrl: string;
}): void {
  const m = opts.meta;
  console.error(
    `[meta/sync] Meta API error scope=${opts.scope} status=${opts.status} code=${
      m?.code ?? "n/a"
    } subcode=${m?.error_subcode ?? "n/a"} type=${m?.type ?? "n/a"} fbtrace_id=${
      m?.fbtrace_id ?? "n/a"
    } message=${m?.message ?? "n/a"} url=${opts.scrubbedUrl}`
  );
}

/**
 * Meta error codes that are transient — retrying after a short pause
 * usually succeeds. Sources: Meta Graph API docs + production experience.
 *
 *   1   "API Unknown" — generic transient at Meta's side.
 *   2   "API Service" — Meta service temporarily unavailable.
 *   4   "API Too Many Calls" — soft rate-limit per app; resolves with backoff.
 *   17  "User request limit reached" — per-user rate-limit.
 *   32  "Page request limit reached" — per-page rate-limit.
 *   613 "Rate limit exceeded" — explicit rate-limit code.
 *
 * Note: code 190 (token expired) is NOT in this set — that's user-action
 * required, not transient. 4xx HTTP codes (other than 429) are also NOT
 * transient.
 */
const META_TRANSIENT_CODES: ReadonlySet<number> = new Set([
  1, 2, 4, 17, 32, 613,
]);

/**
 * Single-attempt outcome of fetchPageOnce. Discriminated union by `kind`:
 *   ok           — proceed to parse json.data and continue paging
 *   transient    — retryable: network blip / 5xx / Meta transient code
 *   rate_limited — hard stop: 429 or x-app-usage >= 95%
 *   fatal        — hard stop, non-retryable: 4xx / Meta fatal / parse / etc.
 */
type PageOutcomeOk<T> = {
  kind: "ok";
  json: MetaPagedResponse<T>;
  rateState: RateLimitState;
};
type PageOutcomeTransient = {
  kind: "transient";
  reason: AbortReason; // 'fetch_error' | 'meta_error'
  errorMessage: string;
  rateState: RateLimitState | null;
};
type PageOutcomeRateLimited = {
  kind: "rate_limited";
  errorMessage: string;
  rateState: RateLimitState;
};
type PageOutcomeFatal = {
  kind: "fatal";
  reason: AbortReason; // 'fetch_error' | 'meta_error' | 'parse_error'
  errorMessage: string;
  rateState: RateLimitState | null;
};
type PageOutcome<T> =
  | PageOutcomeOk<T>
  | PageOutcomeTransient
  | PageOutcomeRateLimited
  | PageOutcomeFatal;

async function fetchPageOnce<TPageItem>(
  url: string,
  pageSignal: AbortSignal,
  scope: string
): Promise<PageOutcome<TPageItem>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", signal: pageSignal });
  } catch (err) {
    // Network error / DNS / connection refused / fetch aborted — treat as
    // transient. If the abort came from the OUTER signal (engine deadline),
    // the outer loop's `signal.aborted` check above will short-circuit
    // before another retry; we don't have to special-case it here.
    const msg = err instanceof Error ? err.message : "fetch failed";
    return {
      kind: "transient",
      reason: "fetch_error",
      errorMessage: msg,
      rateState: null,
    };
  }

  const rateState = getRateLimitState(response.headers);
  const scrubbedUrl = scrubAccessToken(url);

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      /* ignore */
    }
    const meta = parseMetaErrorBody(bodyText);
    const errorMessage = formatMetaErrorMessage({
      status: response.status,
      statusText: response.statusText,
      scrubbedUrl,
      bodyText,
      meta,
    });

    // Hard rate-limit — no retry.
    if (response.status === 429 || shouldAbortSync(rateState)) {
      logMetaApiError({
        scope,
        status: response.status,
        meta,
        scrubbedUrl,
      });
      return { kind: "rate_limited", errorMessage, rateState };
    }

    // 5xx server errors — retry.
    if (response.status >= 500 && response.status < 600) {
      return {
        kind: "transient",
        reason: "fetch_error",
        errorMessage,
        rateState,
      };
    }

    // 4xx non-429 — fatal (bad request, auth, etc.). Don't retry.
    logMetaApiError({
      scope,
      status: response.status,
      meta,
      scrubbedUrl,
    });
    return {
      kind: "fatal",
      reason: "fetch_error",
      errorMessage,
      rateState,
    };
  }

  // 200 OK — parse body.
  let json: MetaPagedResponse<TPageItem>;
  try {
    json = (await response.json()) as MetaPagedResponse<TPageItem>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "json parse failed";
    return {
      kind: "fatal",
      reason: "parse_error",
      errorMessage: msg,
      rateState,
    };
  }

  // Meta error in 200 body — classify by code.
  if (json.error) {
    const meta = extractMetaError(json.error);
    const errorMessage = formatMetaErrorMessage({
      status: response.status,
      statusText: response.statusText,
      scrubbedUrl,
      bodyText: "",
      meta,
    });
    if (meta.code !== null && META_TRANSIENT_CODES.has(meta.code)) {
      // Meta-side transient — retry.
      return {
        kind: "transient",
        reason: "meta_error",
        errorMessage,
        rateState,
      };
    }
    // Non-transient Meta error (token expired = 190, perms = 200, etc.).
    logMetaApiError({
      scope,
      status: response.status,
      meta,
      scrubbedUrl,
    });
    return {
      kind: "fatal",
      reason: "meta_error",
      errorMessage,
      rateState,
    };
  }

  return { kind: "ok", json, rateState };
}

/**
 * Sleep helper that resolves early if the abort signal fires.
 * Avoids dangling 2-second waits after the engine has already given up.
 */
function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function combineSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), {
      once: true,
    });
  }
  return controller.signal;
}

export async function paginatedMetaGet<TPageItem, TOut>(
  opts: PaginatedFetchOptions<TPageItem, TOut>
): Promise<PaginatedResult<TOut>> {
  const maxPages = opts.maxPages ?? MAX_SYNC_PAGES_PER_SCOPE;
  const acc: TOut[] = [];
  let nextUrl: string | null = opts.initialUrl;
  let pages = 0;
  let lastRateState: RateLimitState | null = null;

  while (nextUrl) {
    if (pages >= maxPages) {
      return {
        data: acc,
        abortReason: "truncated",
        errorMessage: null,
        rateLimitState: lastRateState,
        pagesFetched: pages,
      };
    }
    if (opts.signal?.aborted) {
      return {
        data: acc,
        abortReason: "signal",
        errorMessage: null,
        rateLimitState: lastRateState,
        pagesFetched: pages,
      };
    }
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) {
      return {
        data: acc,
        abortReason: "runtime",
        errorMessage: null,
        rateLimitState: lastRateState,
        pagesFetched: pages,
      };
    }

    const scopeLabel = opts.scope ?? "unknown";

    // Retry loop for the CURRENT page. Pages already fetched (`acc`) are
    // never re-fetched — only the page currently failing gets retried.
    //
    // `outcome` holds the FINAL verdict for this page (ok | rate_limited
    // | fatal — never transient, since transient always retries). It's
    // null while still attempting. `lastTransient` keeps the most recent
    // transient verdict to surface as the failure mode if all retries
    // exhaust without reaching a non-transient outcome.
    let outcome:
      | PageOutcomeOk<TPageItem>
      | PageOutcomeRateLimited
      | PageOutcomeFatal
      | null = null;
    let lastTransient: PageOutcomeTransient | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      // Each attempt re-arms the per-page timeout. Without re-arming,
      // the second attempt would inherit an already-expired AbortSignal
      // from the first attempt's timeout.
      const pageSignal = combineSignals(
        AbortSignal.timeout(PAGINATION_TIMEOUT_PER_PAGE_MS),
        opts.signal
      );

      const r: PageOutcome<TPageItem> = await fetchPageOnce<TPageItem>(
        nextUrl,
        pageSignal,
        scopeLabel
      );

      if (r.kind === "ok" || r.kind === "rate_limited" || r.kind === "fatal") {
        outcome = r;
        break;
      }

      // r.kind === 'transient' → backoff + retry, unless this was the last attempt.
      lastTransient = r;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const waitMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.log(
          `[sync] retry ${attempt + 1}/${MAX_RETRY_ATTEMPTS} for scope=${scopeLabel} reason=${r.reason} after ${waitMs}ms`
        );
        await sleepWithSignal(waitMs, opts.signal);

        // After waiting, the engine may have decided to give up entirely.
        if (opts.signal?.aborted) {
          return {
            data: acc,
            abortReason: "signal",
            errorMessage: null,
            rateLimitState: r.rateState ?? lastRateState,
            pagesFetched: pages,
          };
        }
        if (opts.deadline !== undefined && Date.now() >= opts.deadline) {
          return {
            data: acc,
            abortReason: "runtime",
            errorMessage: null,
            rateLimitState: r.rateState ?? lastRateState,
            pagesFetched: pages,
          };
        }
      }
    }

    // Exhausted retries without reaching ok / rate_limited / fatal —
    // promote the last transient error to a real failure for this page.
    if (outcome === null) {
      // lastTransient is guaranteed non-null here: the only way to leave
      // the retry loop without setting `outcome` is to keep hitting
      // transient verdicts, each of which sets lastTransient.
      const fail = lastTransient as PageOutcomeTransient;
      return {
        data: acc,
        abortReason: fail.reason,
        errorMessage: fail.errorMessage,
        rateLimitState: fail.rateState ?? lastRateState,
        pagesFetched: pages,
      };
    }

    if (outcome.kind === "rate_limited") {
      return {
        data: acc,
        abortReason: "rate_limited",
        errorMessage: outcome.errorMessage,
        rateLimitState: outcome.rateState,
        pagesFetched: pages,
      };
    }

    if (outcome.kind === "fatal") {
      return {
        data: acc,
        abortReason: outcome.reason,
        errorMessage: outcome.errorMessage,
        rateLimitState: outcome.rateState ?? lastRateState,
        pagesFetched: pages,
      };
    }

    // outcome.kind === 'ok' — narrowed by the two checks above.
    const json: MetaPagedResponse<TPageItem> = outcome.json;
    const rateState = outcome.rateState;
    lastRateState = rateState;

    const items = json.data ?? [];
    try {
      for (const raw of items) {
        acc.push(opts.mapItem(raw));
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "item mapping failed";
      return {
        data: acc,
        abortReason: "parse_error",
        errorMessage: msg,
        rateLimitState: rateState,
        pagesFetched: pages + 1,
      };
    }

    pages += 1;

    if (shouldAbortSync(rateState)) {
      return {
        data: acc,
        abortReason: "rate_limited",
        errorMessage: null,
        rateLimitState: rateState,
        pagesFetched: pages,
      };
    }

    nextUrl = json.paging?.next ?? null;
  }

  return {
    data: acc,
    abortReason: null,
    errorMessage: null,
    rateLimitState: lastRateState,
    pagesFetched: pages,
  };
}

/**
 * Safe parsers — Meta returns numbers as strings ("123.45") quite often.
 * Used by all fetchers' mapItem functions.
 */

export function parseNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseIntOrZero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

export function parseFloatOrZero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parseStringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}
