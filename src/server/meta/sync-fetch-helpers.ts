import "server-only";
import {
  getRateLimitState,
  shouldAbortSync,
  type RateLimitState,
} from "./rate-limit";
import {
  MAX_SYNC_PAGES_PER_SCOPE,
  PAGINATION_TIMEOUT_PER_PAGE_MS,
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

    const pageSignal = combineSignals(
      AbortSignal.timeout(PAGINATION_TIMEOUT_PER_PAGE_MS),
      opts.signal
    );

    let response: Response;
    try {
      response = await fetch(nextUrl, {
        method: "GET",
        signal: pageSignal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      return {
        data: acc,
        abortReason: "fetch_error",
        errorMessage: msg,
        rateLimitState: lastRateState,
        pagesFetched: pages,
      };
    }

    const rateState = getRateLimitState(response.headers);
    lastRateState = rateState;

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        /* ignore */
      }
      const meta = parseMetaErrorBody(bodyText);
      const scrubbedUrl = scrubAccessToken(nextUrl);
      const scopeLabel = opts.scope ?? "unknown";
      logMetaApiError({
        scope: scopeLabel,
        status: response.status,
        meta,
        scrubbedUrl,
      });
      const errorMessage = formatMetaErrorMessage({
        status: response.status,
        statusText: response.statusText,
        scrubbedUrl,
        bodyText,
        meta,
      });
      const isRateLimit =
        shouldAbortSync(rateState) || response.status === 429;
      return {
        data: acc,
        abortReason: isRateLimit ? "rate_limited" : "fetch_error",
        errorMessage,
        rateLimitState: rateState,
        pagesFetched: pages,
      };
    }

    let json: MetaPagedResponse<TPageItem>;
    try {
      json = (await response.json()) as MetaPagedResponse<TPageItem>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "json parse failed";
      return {
        data: acc,
        abortReason: "parse_error",
        errorMessage: msg,
        rateLimitState: rateState,
        pagesFetched: pages,
      };
    }

    if (json.error) {
      const meta = extractMetaError(json.error);
      const scrubbedUrl = scrubAccessToken(nextUrl);
      const scopeLabel = opts.scope ?? "unknown";
      logMetaApiError({
        scope: scopeLabel,
        status: response.status,
        meta,
        scrubbedUrl,
      });
      const errorMessage = formatMetaErrorMessage({
        status: response.status,
        statusText: response.statusText,
        scrubbedUrl,
        bodyText: "",
        meta,
      });
      return {
        data: acc,
        abortReason: "meta_error",
        errorMessage,
        rateLimitState: rateState,
        pagesFetched: pages,
      };
    }

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
