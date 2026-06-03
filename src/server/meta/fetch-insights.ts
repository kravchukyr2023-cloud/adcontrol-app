import "server-only";
import { META_GRAPH_BASE } from "./meta-config";
import { MAX_INSIGHT_ROWS_PER_REQUEST } from "./sync-constants";
import {
  paginatedMetaGet,
  parseFloatOrZero,
  parseIntOrZero,
  parseNumOrNull,
  parseStringOrNull,
  type AbortReason,
  type PaginatedResult,
} from "./sync-fetch-helpers";
import type { RateLimitState } from "./rate-limit";
import {
  normalizeActions,
  type MetaAction,
  type MetaActionValue,
} from "./actions-normalizer";
import { debugLog } from "./sync-debug";

/**
 * Fetcher: Meta insights at one of 4 levels.
 *
 * Pure I/O + parse + normalize-actions. No DB, no Supabase, no events,
 * no project context.
 *
 * GET /v22.0/{ad_account_id}/insights
 *   ?level={account|campaign|adset|ad}
 *   &fields=spend,impressions,clicks,unique_clicks,ctr,cpc,cpm,
 *           reach,frequency,actions,action_values,
 *           account_id,campaign_id,adset_id,ad_id,
 *           date_start,date_stop
 *   &time_range={"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}
 *   &time_increment=1
 *   &limit=500
 *
 * One ad-account-scoped request per level returns all sub-resources'
 * daily insights via Meta's built-in expansion. The sync engine calls
 * this 4 times per binding (account / campaign / adset / ad).
 *
 * `date` is Meta's date_start AS-IS — the AA's timezone bucket.
 * Fetcher does NOT convert to UTC (required for AdControl ↔ Meta UI
 * parity).
 */

export type InsightLevel = "account" | "campaign" | "adset" | "ad";

export type InsightRecord = {
  level: InsightLevel;
  /** Stable text Meta id of the resource this row describes. */
  resource_id: string;
  /** Parent refs as text Meta ids (denorm for downstream upserters). */
  account_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  /** YYYY-MM-DD in the ad account's timezone (Meta date_start as-is). */
  date: string;

  spend: number;
  impressions: number;
  clicks: number;
  unique_clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  reach: number | null;
  frequency: number | null;

  /**
   * Normalized via actions-normalizer: priority-OR across
   *   omni_purchase → offsite_conversion.fb_pixel_purchase
   *   → onsite_web_purchase → purchase
   * Picks the first present action_type with value > 0. Does NOT sum.
   */
  purchases: number;
  /**
   * Normalized via actions-normalizer: priority-OR across
   *   onsite_conversion.lead_grouped → lead
   *   → offsite_conversion.fb_pixel_lead → onsite_web_lead
   * Picks the first present action_type with value > 0. Does NOT sum.
   */
  leads: number;
  /** Verbatim Meta arrays for raw_actions jsonb storage. */
  raw_actions: {
    actions: MetaAction[];
    action_values: MetaActionValue[];
  };
};

export type FetchInsightsResult = {
  insights: InsightRecord[];
  abortReason: AbortReason | null;
  errorMessage: string | null;
  pagesFetched: number;
  rateLimitState: RateLimitState | null;
};

type InsightRawRow = {
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  unique_clicks?: string | number;
  ctr?: string | number;
  cpc?: string | number;
  cpm?: string | number;
  reach?: string | number;
  frequency?: string | number;
  actions?: MetaAction[];
  action_values?: MetaActionValue[];
};

const FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "unique_clicks",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  "frequency",
  "actions",
  "action_values",
  "account_id",
  "campaign_id",
  "adset_id",
  "ad_id",
  "date_start",
  "date_stop",
].join(",");

function buildUrl(opts: {
  token: string;
  metaAdAccountId: string;
  level: InsightLevel;
  since: string;
  until: string;
}): string {
  const url = new URL(`${META_GRAPH_BASE}/${opts.metaAdAccountId}/insights`);
  url.searchParams.set("level", opts.level);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: opts.since, until: opts.until })
  );
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("limit", String(MAX_INSIGHT_ROWS_PER_REQUEST));
  url.searchParams.set("access_token", opts.token);
  return url.toString();
}

function resolveResourceId(level: InsightLevel, row: InsightRawRow): string {
  switch (level) {
    case "account":
      // Meta returns "act_xxx" as account_id on insight rows OR omits it.
      // Caller passes metaAdAccountId we trust as resource_id fallback.
      return parseStringOrNull(row.account_id) ?? "";
    case "campaign":
      return parseStringOrNull(row.campaign_id) ?? "";
    case "adset":
      return parseStringOrNull(row.adset_id) ?? "";
    case "ad":
      return parseStringOrNull(row.ad_id) ?? "";
  }
}

function mapRow(
  level: InsightLevel,
  fallbackResourceId: string,
  raw: InsightRawRow
): InsightRecord {
  const resourceFromRow = resolveResourceId(level, raw);
  const resource_id =
    resourceFromRow.length > 0 ? resourceFromRow : fallbackResourceId;

  if (resource_id.length === 0) {
    throw new Error(`insight row at level=${level} missing resource id`);
  }
  if (typeof raw.date_start !== "string" || raw.date_start.length === 0) {
    throw new Error("insight row missing date_start");
  }

  const norm = normalizeActions({
    actions: raw.actions,
    actionValues: raw.action_values,
  });

  return {
    level,
    resource_id,
    account_id: parseStringOrNull(raw.account_id),
    campaign_id: parseStringOrNull(raw.campaign_id),
    adset_id: parseStringOrNull(raw.adset_id),
    ad_id: parseStringOrNull(raw.ad_id),
    date: raw.date_start,
    spend: parseFloatOrZero(raw.spend),
    impressions: parseIntOrZero(raw.impressions),
    clicks: parseIntOrZero(raw.clicks),
    unique_clicks: parseIntOrZero(raw.unique_clicks),
    ctr: parseNumOrNull(raw.ctr),
    cpc: parseNumOrNull(raw.cpc),
    cpm: parseNumOrNull(raw.cpm),
    reach: parseNumOrNull(raw.reach),
    frequency: parseNumOrNull(raw.frequency),
    purchases: norm.purchases,
    leads: norm.leads,
    raw_actions: norm.rawActions,
  };
}

export async function fetchInsights(opts: {
  token: string;
  metaAdAccountId: string;
  level: InsightLevel;
  /** YYYY-MM-DD (inclusive) — interpreted in the ad account's timezone. */
  since: string;
  /** YYYY-MM-DD (inclusive) — interpreted in the ad account's timezone. */
  until: string;
  signal?: AbortSignal;
  deadline?: number;
}): Promise<FetchInsightsResult> {
  const fallbackResourceId =
    opts.level === "account" ? opts.metaAdAccountId : "";

  const initialUrl = buildUrl(opts);
  const scrubbedUrl = (() => {
    try {
      const u = new URL(initialUrl);
      if (u.searchParams.has("access_token")) {
        u.searchParams.set("access_token", "REDACTED");
      }
      return u.toString();
    } catch {
      return initialUrl.replace(
        /([?&])access_token=[^&]*/g,
        "$1access_token=REDACTED"
      );
    }
  })();

  debugLog(
    `[meta/sync] insights request scope=${opts.level}_insights AA=${opts.metaAdAccountId} level=${opts.level} since=${opts.since} until=${opts.until} url=${scrubbedUrl}`
  );

  const result: PaginatedResult<InsightRecord> = await paginatedMetaGet<
    InsightRawRow,
    InsightRecord
  >({
    initialUrl,
    signal: opts.signal,
    deadline: opts.deadline,
    mapItem: (raw: InsightRawRow) =>
      mapRow(opts.level, fallbackResourceId, raw),
    scope: `${opts.level}_insights`,
  });

  debugLog(
    `[meta/sync] insights response scope=${opts.level}_insights AA=${opts.metaAdAccountId} dataLen=${result.data.length} pages=${result.pagesFetched} abortReason=${result.abortReason ?? "—"}${
      result.errorMessage ? ` err=${result.errorMessage}` : ""
    }`
  );

  return {
    insights: result.data,
    abortReason: result.abortReason,
    errorMessage: result.errorMessage,
    pagesFetched: result.pagesFetched,
    rateLimitState: result.rateLimitState,
  };
}
