import "server-only";
import { META_GRAPH_BASE } from "./meta-config";
import {
  ENTITY_FETCH_EFFECTIVE_STATUSES,
  MAX_INSIGHT_ROWS_PER_REQUEST,
} from "./sync-constants";
import {
  paginatedMetaGet,
  parseNumOrNull,
  parseStringOrNull,
  type AbortReason,
  type PaginatedResult,
} from "./sync-fetch-helpers";
import type { RateLimitState } from "./rate-limit";

/**
 * Fetcher: Meta ad sets under an ad account.
 *
 * Pure I/O + parse. No DB, no Supabase, no events, no project context.
 *
 * GET /v22.0/{ad_account_id}/adsets
 *   ?fields=id,name,campaign_id,status,effective_status,
 *           daily_budget,lifetime_budget,bid_amount,
 *           optimization_goal,billing_event,targeting,
 *           start_time,end_time,created_time,updated_time
 *   &effective_status=[...]
 *   &limit=500
 */

export type AdsetRecord = {
  meta_adset_id: string;
  meta_campaign_id: string | null;
  adset_name: string | null;
  adset_status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  bid_amount: number | null;
  optimization_goal: string | null;
  billing_event: string | null;
  /** Full targeting jsonb from Meta — stored as-is on meta_adsets.targeting. */
  targeting: Record<string, unknown> | null;
  start_time: string | null;
  end_time: string | null;
  created_time: string | null;
  updated_time: string | null;
};

export type FetchAdsetsResult = {
  adsets: AdsetRecord[];
  abortReason: AbortReason | null;
  errorMessage: string | null;
  pagesFetched: number;
  rateLimitState: RateLimitState | null;
};

type AdsetRawRow = {
  id?: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string | number;
  lifetime_budget?: string | number;
  bid_amount?: string | number;
  optimization_goal?: string;
  billing_event?: string;
  targeting?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
  created_time?: string;
  updated_time?: string;
};

const FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "bid_amount",
  "optimization_goal",
  "billing_event",
  "targeting",
  "start_time",
  "end_time",
  "created_time",
  "updated_time",
].join(",");

// Meta Graph entity endpoints do not support querying deleted/archived
// objects via effective_status. See ENTITY_FETCH_EFFECTIVE_STATUSES.
function buildUrl(token: string, metaAdAccountId: string): string {
  const url = new URL(`${META_GRAPH_BASE}/${metaAdAccountId}/adsets`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", String(MAX_INSIGHT_ROWS_PER_REQUEST));
  url.searchParams.set(
    "effective_status",
    JSON.stringify(ENTITY_FETCH_EFFECTIVE_STATUSES)
  );
  url.searchParams.set("access_token", token);
  return url.toString();
}

function mapRow(raw: AdsetRawRow): AdsetRecord {
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new Error("adset row missing id");
  }
  return {
    meta_adset_id: raw.id,
    meta_campaign_id: parseStringOrNull(raw.campaign_id),
    adset_name: parseStringOrNull(raw.name),
    adset_status: parseStringOrNull(raw.status),
    effective_status: parseStringOrNull(raw.effective_status),
    daily_budget: parseNumOrNull(raw.daily_budget),
    lifetime_budget: parseNumOrNull(raw.lifetime_budget),
    bid_amount: parseNumOrNull(raw.bid_amount),
    optimization_goal: parseStringOrNull(raw.optimization_goal),
    billing_event: parseStringOrNull(raw.billing_event),
    targeting:
      raw.targeting && typeof raw.targeting === "object"
        ? raw.targeting
        : null,
    start_time: parseStringOrNull(raw.start_time),
    end_time: parseStringOrNull(raw.end_time),
    created_time: parseStringOrNull(raw.created_time),
    updated_time: parseStringOrNull(raw.updated_time),
  };
}

export async function fetchAdsets(opts: {
  token: string;
  metaAdAccountId: string;
  signal?: AbortSignal;
  deadline?: number;
}): Promise<FetchAdsetsResult> {
  const result: PaginatedResult<AdsetRecord> = await paginatedMetaGet({
    initialUrl: buildUrl(opts.token, opts.metaAdAccountId),
    signal: opts.signal,
    deadline: opts.deadline,
    mapItem: mapRow,
    scope: "adsets",
  });

  return {
    adsets: result.data,
    abortReason: result.abortReason,
    errorMessage: result.errorMessage,
    pagesFetched: result.pagesFetched,
    rateLimitState: result.rateLimitState,
  };
}
