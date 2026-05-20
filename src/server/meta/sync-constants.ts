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
