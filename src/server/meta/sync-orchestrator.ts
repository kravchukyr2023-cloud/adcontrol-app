import "server-only";
import {
  acquireLock,
  refreshHeartbeat,
  releaseLock,
  type ReleaseStatus,
} from "./lock-management";
import {
  ATTRIBUTION_BUFFER_DAYS,
  FIRST_SYNC_DAYS,
  MAX_SYNC_DAYS,
  MAX_SYNC_RUNTIME_MS,
  MIN_SYNC_DAYS,
  RESYNC_DAYS,
} from "./sync-constants";
import { fetchCampaigns } from "./fetch-campaigns";
import { fetchAdsets } from "./fetch-adsets";
import { fetchAds } from "./fetch-ads";
import { fetchInsights } from "./fetch-insights";
import { upsertCampaigns } from "./upsert-campaigns";
import { upsertAdsets } from "./upsert-adsets";
import { upsertAds } from "./upsert-ads";
import { upsertAccountInsights } from "./upsert-account-insights";
import { upsertCampaignInsights } from "./upsert-campaign-insights";
import { upsertAdsetInsights } from "./upsert-adset-insights";
import { upsertAdInsights } from "./upsert-ad-insights";
import type { AbortReason } from "./sync-fetch-helpers";
import type { UpsertResult } from "./upsert-helpers";
import { debugLog, debugWarn } from "./sync-debug";

/**
 * P2.4C — sync orchestration (per ad account).
 *
 * Flow:
 *   1. acquireLock on (user, 'ad_account', meta_ad_account_id_text)
 *   2. compute date window (first sync = 30d, re-sync = 7d)
 *   3. set hard runtime cap via AbortController.timeout
 *   4. set soft deadline at 85% of cap (leaves headroom for releaseLock)
 *   5. run scopes sequentially:
 *        campaigns → adsets → ads
 *        account_insights → campaign_insights → adset_insights → ad_insights
 *      Heartbeat refresh between scopes. Skip remaining scopes once
 *      the soft deadline is reached (partial sync).
 *   6. releaseLock with final status:
 *        - all scopes ok                     → 'idle'
 *        - any scope truncated/runtime/rate  → 'partial'
 *        - fatal Meta error / parse error    → 'error'
 *
 * Layer rules:
 *   - No raw SQL (delegates to lock-management + state-management + upserters).
 *   - No Meta HTTP code (delegates to fetchers).
 *   - No project context (caller resolves projects → AAs → tokens).
 */

export type ScopeStatus = "ok" | "partial" | "error" | "skipped";

export type ScopeResult = {
  scope: string;
  status: ScopeStatus;
  rowsFetched: number;
  rowsPersisted: number;
  pagesFetched: number;
  abortReason: AbortReason | null;
  errorMessage: string | null;
};

export type SyncAdAccountResult = {
  acquired: boolean;
  lockReason?: string;
  finalStatus?: ReleaseStatus;
  recovered?: boolean;
  durationMs?: number;
  scopes?: ScopeResult[];
  errorMessage?: string;
};

type SyncParams = {
  userId: string;
  /** Stable text Meta id, e.g. "act_1234567890". Used for API + lock key. */
  metaAdAccountIdText: string;
  /** UUID of the meta_ad_accounts row — used as FK on entity rows. */
  metaAdAccountIdFk: string;
  /** Currency snapshot from meta_ad_accounts (USD / EUR / …). */
  currency: string | null;
  /** OAuth access token for the connection that owns this AA. */
  accessToken: string;
  /** True for user-triggered syncs (button click). Sets last_manual_sync_at. */
  isManual?: boolean;
  /**
   * Optional per-AA runtime budget in ms. Used by sync-project.ts to
   * slice the project-level soft deadline across parallel AAs. Defaults
   * to MAX_SYNC_RUNTIME_MS when omitted (single-AA path / manual button).
   */
  runtimeBudgetMs?: number;
};

const HARD_TIMEOUT_RATIO = 1.0;
const SOFT_DEADLINE_RATIO = 0.85;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Compute the date window to pull insights for, dynamically adapting to
 * how long ago the previous successful sync ran.
 *
 * Architecture problem this solves (audit issue #2):
 *   Previously this was `days = lastSync ? RESYNC_DAYS : FIRST_SYNC_DAYS`.
 *   That meant a user who returned after 14 days got a fixed 7-day re-sync
 *   — days [today-14 .. today-7] were never fetched again and Meta would
 *   not retroactively serve them on future syncs either. Permanent gaps.
 *
 * Dynamic formula:
 *   No prior sync          → FIRST_SYNC_DAYS   (30)
 *   Prior sync available   → max(RESYNC_DAYS, daysSinceLastSync + ATTRIBUTION_BUFFER_DAYS)
 *   Then clamp result into [MIN_SYNC_DAYS, MAX_SYNC_DAYS]
 *
 * Edge cases handled:
 *   - lastSuccessfulSyncAt in the future (clock skew / manual DB edit):
 *       `daysSinceLastSync` is floored at 0 — we never compute negative
 *       windows or skip ahead.
 *   - lastSuccessfulSyncAt is today (daysSinceLastSync = 0):
 *       formula yields max(7, 0+2) = 7. Pulls the routine 7-day window.
 *   - lastSuccessfulSyncAt is unparseable string:
 *       falls back to FIRST_SYNC_DAYS as if no prior sync existed.
 *   - User returns after 95 days:
 *       proposed = 97 → clamped to MAX_SYNC_DAYS (90). Safety ceiling
 *       prevents runtime-budget blowouts.
 */
function computeWindow(lastSuccessfulSyncAt: string | null): {
  since: string;
  until: string;
  days: number;
  daysSinceLastSync: number | null;
} {
  const today = new Date();

  let daysSinceLastSync: number | null = null;
  if (lastSuccessfulSyncAt) {
    const parsed = new Date(lastSuccessfulSyncAt);
    if (!Number.isNaN(parsed.getTime())) {
      const rawDiffMs = today.getTime() - parsed.getTime();
      // Clamp negative diffs (future timestamps) to 0 — defensive.
      daysSinceLastSync = Math.max(
        0,
        Math.floor(rawDiffMs / (1000 * 60 * 60 * 24))
      );
    }
  }

  const proposed =
    daysSinceLastSync === null
      ? FIRST_SYNC_DAYS
      : Math.max(RESYNC_DAYS, daysSinceLastSync + ATTRIBUTION_BUFFER_DAYS);

  const days = Math.min(MAX_SYNC_DAYS, Math.max(MIN_SYNC_DAYS, proposed));

  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - days);

  return {
    since: toIsoDate(since),
    until: toIsoDate(today),
    days,
    daysSinceLastSync,
  };
}

function scopeStatusFromFetch(
  abortReason: AbortReason | null
): { status: ScopeStatus; fatal: boolean } {
  if (abortReason === null) return { status: "ok", fatal: false };
  if (
    abortReason === "truncated" ||
    abortReason === "runtime" ||
    abortReason === "rate_limited" ||
    abortReason === "signal"
  ) {
    return { status: "partial", fatal: false };
  }
  // fetch_error / meta_error / parse_error
  return { status: "error", fatal: true };
}

function mergeUpsertOutcome(
  base: ScopeResult,
  upsert: UpsertResult
): ScopeResult {
  const out: ScopeResult = {
    ...base,
    rowsPersisted: upsert.persisted,
  };
  if (!upsert.ok) {
    // Fetch may have been clean, but persistence partially failed.
    if (out.status === "ok") out.status = "partial";
    out.errorMessage = upsert.errors.slice(0, 3).join("; ");
  }
  return out;
}

function aggregateFinalStatus(scopes: ScopeResult[]): ReleaseStatus {
  if (scopes.some((s) => s.status === "error")) return "error";
  if (scopes.some((s) => s.status === "partial" || s.status === "skipped")) {
    return "partial";
  }
  return "idle";
}

export async function syncAdAccount(
  params: SyncParams
): Promise<SyncAdAccountResult> {
  const lockKey = {
    userId: params.userId,
    resourceType: "ad_account",
    resourceId: params.metaAdAccountIdText,
  };

  debugLog(
    `[meta/sync] lock acquire start AA=${params.metaAdAccountIdText}`
  );
  const lock = await acquireLock(lockKey);
  if (!lock.acquired) {
    debugWarn(
      `[meta/sync] lock failed AA=${params.metaAdAccountIdText} reason=${lock.reason}`
    );
    return {
      acquired: false,
      lockReason: lock.reason,
      errorMessage: lock.errorMessage,
    };
  }
  debugLog(
    `[meta/sync] lock acquired AA=${params.metaAdAccountIdText} recovered=${lock.recovered}`
  );

  const startMs = Date.now();
  // Effective runtime budget for this AA — falls back to the global
  // MAX_SYNC_RUNTIME_MS when caller (manual button / single-AA path)
  // doesn't slice. sync-project.ts passes a smaller value in parallel
  // multi-AA mode so each AA gets a fair share of the project budget.
  const runtimeBudget = params.runtimeBudgetMs ?? MAX_SYNC_RUNTIME_MS;
  const hardDeadline = startMs + Math.floor(runtimeBudget * HARD_TIMEOUT_RATIO);
  const softDeadline = startMs + Math.floor(runtimeBudget * SOFT_DEADLINE_RATIO);

  const controller = new AbortController();
  const hardTimeout = setTimeout(
    () => controller.abort(new Error("sync hard timeout")),
    runtimeBudget
  );

  const scopes: ScopeResult[] = [];
  const windowDecision = computeWindow(lock.lastSuccessfulSyncAt);
  debugLog(
    `[sync] window = ${windowDecision.days} days (lastSync = ${
      lock.lastSuccessfulSyncAt ?? "—"
    }, daysSinceLastSync = ${windowDecision.daysSinceLastSync ?? "—"}) ` +
      `since=${windowDecision.since} until=${windowDecision.until}`
  );
  const { since, until } = windowDecision;

  const shouldStop = () => Date.now() >= softDeadline;

  const recordSkipped = (scope: string) => {
    debugWarn(
      `[meta/sync] scope skipped ${scope} — soft deadline reached AA=${params.metaAdAccountIdText}`
    );
    scopes.push({
      scope,
      status: "skipped",
      rowsFetched: 0,
      rowsPersisted: 0,
      pagesFetched: 0,
      abortReason: null,
      errorMessage: "soft deadline reached",
    });
  };

  const logScopeStart = (name: string) =>
    debugLog(
      `[meta/sync] scope start ${name} AA=${params.metaAdAccountIdText}`
    );
  const logScopeDone = (s: ScopeResult) =>
    debugLog(
      `[meta/sync] scope done ${s.scope} status=${s.status} rowsFetched=${s.rowsFetched} rowsPersisted=${s.rowsPersisted} pages=${s.pagesFetched}${
        s.abortReason ? ` abortReason=${s.abortReason}` : ""
      }${s.errorMessage ? ` err=${s.errorMessage}` : ""}`
    );

  try {
    // -------------------- 1. CAMPAIGNS --------------------
    {
      logScopeStart("campaigns");
      const r = await fetchCampaigns({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "campaigns",
        status: fetchOutcome.status,
        rowsFetched: r.campaigns.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.campaigns.length > 0) {
        const up = await upsertCampaigns({
          userId: params.userId,
          metaAdAccountIdFk: params.metaAdAccountIdFk,
          rows: r.campaigns,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);

      if (fetchOutcome.fatal) {
        // Skip remaining child-entity scopes if campaigns failed catastrophically.
        // Insights can still be useful but child entities depend on this cache.
      }
    }

    // -------------------- 2. ADSETS --------------------
    if (shouldStop()) {
      recordSkipped("adsets");
    } else {
      logScopeStart("adsets");
      const r = await fetchAdsets({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "adsets",
        status: fetchOutcome.status,
        rowsFetched: r.adsets.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.adsets.length > 0) {
        const up = await upsertAdsets({
          userId: params.userId,
          rows: r.adsets,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);
    }

    // -------------------- 3. ADS --------------------
    if (shouldStop()) {
      recordSkipped("ads");
    } else {
      logScopeStart("ads");
      const r = await fetchAds({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "ads",
        status: fetchOutcome.status,
        rowsFetched: r.ads.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.ads.length > 0) {
        const up = await upsertAds({
          userId: params.userId,
          rows: r.ads,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);
    }

    // -------------------- 4. ACCOUNT INSIGHTS --------------------
    if (shouldStop()) {
      recordSkipped("account_insights");
    } else {
      logScopeStart("account_insights");
      const r = await fetchInsights({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        level: "account",
        since,
        until,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "account_insights",
        status: fetchOutcome.status,
        rowsFetched: r.insights.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.insights.length > 0) {
        const up = await upsertAccountInsights({
          userId: params.userId,
          metaAdAccountIdFk: params.metaAdAccountIdFk,
          metaAdAccountId: params.metaAdAccountIdText,
          currency: params.currency,
          rows: r.insights,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);
    }

    // -------------------- 5. CAMPAIGN INSIGHTS --------------------
    if (shouldStop()) {
      recordSkipped("campaign_insights");
    } else {
      logScopeStart("campaign_insights");
      const r = await fetchInsights({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        level: "campaign",
        since,
        until,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "campaign_insights",
        status: fetchOutcome.status,
        rowsFetched: r.insights.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.insights.length > 0) {
        const up = await upsertCampaignInsights({
          userId: params.userId,
          currency: params.currency,
          rows: r.insights,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);
    }

    // -------------------- 6. ADSET INSIGHTS --------------------
    if (shouldStop()) {
      recordSkipped("adset_insights");
    } else {
      logScopeStart("adset_insights");
      const r = await fetchInsights({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        level: "adset",
        since,
        until,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "adset_insights",
        status: fetchOutcome.status,
        rowsFetched: r.insights.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.insights.length > 0) {
        const up = await upsertAdsetInsights({
          userId: params.userId,
          currency: params.currency,
          rows: r.insights,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);
    }

    // -------------------- 7. AD INSIGHTS --------------------
    if (shouldStop()) {
      recordSkipped("ad_insights");
    } else {
      logScopeStart("ad_insights");
      const r = await fetchInsights({
        token: params.accessToken,
        metaAdAccountId: params.metaAdAccountIdText,
        level: "ad",
        since,
        until,
        signal: controller.signal,
        deadline: softDeadline,
      });
      const fetchOutcome = scopeStatusFromFetch(r.abortReason);
      let scope: ScopeResult = {
        scope: "ad_insights",
        status: fetchOutcome.status,
        rowsFetched: r.insights.length,
        rowsPersisted: 0,
        pagesFetched: r.pagesFetched,
        abortReason: r.abortReason,
        errorMessage: r.errorMessage,
      };
      if (r.insights.length > 0) {
        const up = await upsertAdInsights({
          userId: params.userId,
          currency: params.currency,
          rows: r.insights,
        });
        scope = mergeUpsertOutcome(scope, up);
      }
      scopes.push(scope);
      logScopeDone(scope);
      await refreshHeartbeat(lockKey);
    }

    void hardDeadline; // referenced for future per-scope dynamic ceilings

    const finalStatus = aggregateFinalStatus(scopes);
    const aggregatedError =
      finalStatus === "error"
        ? scopes
            .filter((s) => s.status === "error")
            .map((s) => `${s.scope}: ${s.errorMessage ?? "unknown"}`)
            .join("; ")
        : undefined;

    debugLog(
      `[meta/sync] releasing lock AA=${params.metaAdAccountIdText} finalStatus=${finalStatus}`
    );
    await releaseLock({
      key: lockKey,
      finalStatus,
      errorMessage: aggregatedError,
      isManual: params.isManual,
    });

    return {
      acquired: true,
      recovered: lock.recovered,
      finalStatus,
      durationMs: Date.now() - startMs,
      scopes,
      errorMessage: aggregatedError,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown sync error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      `[meta/sync] ERROR in syncAdAccount AA=${params.metaAdAccountIdText} ${msg}`
    );
    if (stack) console.error(`[meta/sync] STACK ${stack}`);
    await releaseLock({
      key: lockKey,
      finalStatus: "error",
      errorMessage: msg,
      isManual: params.isManual,
    });
    return {
      acquired: true,
      recovered: lock.recovered,
      finalStatus: "error",
      durationMs: Date.now() - startMs,
      scopes,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(hardTimeout);
  }
}
