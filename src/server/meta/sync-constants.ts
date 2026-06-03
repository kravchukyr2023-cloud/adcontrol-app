import "server-only";

/**
 * Centralized Phase 2 sync engine constants.
 *
 * Locked early so all fetchers / upserters / engine share the same
 * limits. Changing these affects sync safety budgets across the
 * whole sync layer — adjust here only.
 */

/**
 * Maximum pages fetched per scope before truncating to status='partial'.
 * Each page = up to MAX_INSIGHT_ROWS_PER_REQUEST rows.
 */
export const MAX_SYNC_PAGES_PER_SCOPE = 50;

/**
 * Maximum total rows written across ALL scopes in a single sync run.
 * Prevents runaway upserts on very large accounts.
 */
export const MAX_SYNC_ROWS_PER_RUN = 100_000;

/**
 * Maximum wall-clock runtime for a single sync run.
 * Sits comfortably under Vercel Pro 60s timeout; leaves headroom for
 * final UPDATE meta_sync_states + audit event write.
 */
export const MAX_SYNC_RUNTIME_MS = 25_000;

/**
 * Days back to fetch on first sync (when sync_version = 0).
 */
export const FIRST_SYNC_DAYS = 30;

/**
 * Days back to fetch on routine re-sync. Matches Meta's typical late
 * attribution back-fill window (~7 days) so UPSERT idempotency corrects
 * late conversion data.
 */
export const RESYNC_DAYS = 7;

/**
 * Extra days added on top of `daysSinceLastSync` when computing the
 * dynamic re-sync window. Meta can retroactively backfill attribution
 * (purchases / leads) up to ~48 hours after the event — without this
 * buffer, a sync done 1 day after the previous one would miss late
 * attribution for the day just before. Two days is a safe minimum.
 */
export const ATTRIBUTION_BUFFER_DAYS = 2;

/**
 * Lower bound for the dynamic re-sync window. Even if the user just
 * synced an hour ago, we still pull at least RESYNC_DAYS so late
 * attribution within Meta's standard back-fill window stays covered.
 */
export const MIN_SYNC_DAYS = RESYNC_DAYS;

/**
 * Upper bound for the dynamic re-sync window. Protects against pulling
 * the entire account history if the user comes back after a months-long
 * pause (a 365-day window would blow the orchestrator's runtime budget
 * and Meta's per-request limits). 90 days is a pragmatic ceiling that
 * still covers a normal quarterly cadence.
 */
export const MAX_SYNC_DAYS = 90;

/**
 * Heartbeat-based stale lock detection threshold. Live syncs refresh
 * meta_sync_states.heartbeat_at every page/scope boundary (~1-3s). A
 * lock without heartbeat update in this window is considered orphan
 * (process likely died) and can be overwritten.
 */
export const STALE_LOCK_TIMEOUT_MS = 30_000;

/**
 * Per-page Meta API request timeout (AbortController budget).
 */
export const PAGINATION_TIMEOUT_PER_PAGE_MS = 8_000;

/**
 * Meta API max `limit` parameter for insights / entity list endpoints.
 */
export const MAX_INSIGHT_ROWS_PER_REQUEST = 500;

/**
 * Total fetch attempts per single page (1 initial + N-1 retries).
 * With MAX_RETRY_ATTEMPTS=3 we tolerate up to 2 transient blips per page
 * before declaring the scope failed. This is the retry knob mentioned in
 * audit issue #7 (Meta sometimes returns 5xx or transient error codes
 * for ~1-2s; without retry a single blip kills the entire scope).
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base for exponential backoff between retries. Wait between attempts
 * is `RETRY_BACKOFF_BASE_MS * 2^(attempt-1)`:
 *   attempt 1 → 2:  1000 ms
 *   attempt 2 → 3:  2000 ms
 * Total worst case before giving up on a single page: 3 fetch attempts
 * + 3 seconds of sleep, ~well under PAGINATION_TIMEOUT_PER_PAGE_MS budget.
 */
export const RETRY_BACKOFF_BASE_MS = 1000;

/**
 * Per-AA floor for the parallel multi-AA sync runtime budget.
 *
 * In parallel mode (sync-project.ts), each AA gets a slice of the
 * orchestrator's soft deadline: `(MAX_SYNC_RUNTIME_MS * 0.85) / aaCount`.
 * For users with many AAs the slice would shrink to seconds — at some
 * point too small for any meaningful sync (a single Meta page fetch
 * already takes ~1-3s). The floor guarantees each AA at least 5s of
 * actual work, even if that means the total wall-clock exceeds the
 * project budget on very large portfolios. Better to sync some AAs
 * properly than all of them not at all.
 */
export const MIN_PER_AA_RUNTIME_MS = 5_000;

/**
 * effective_status values allowed in /campaigns, /adsets, /ads queries.
 *
 * Meta Graph entity endpoints do not support querying deleted/archived
 * objects via effective_status — including DELETED or ARCHIVED yields
 * code=100 subcode=1815001 "Requests for deleted objects are not
 * supported on this endpoint."
 *
 * Side-effect: we cannot detect transitions INTO deleted/archived via
 * routine sync. Cached entities that vanish from Meta will simply stop
 * being refreshed (status stays at whatever was last seen). Soft-delete
 * detection is deferred to a separate code path (webhook or targeted
 * by-id GET).
 */
export const ENTITY_FETCH_EFFECTIVE_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
];
