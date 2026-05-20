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
 * Fetcher: Meta campaigns under an ad account.
 *
 * Pure I/O + parse. No DB, no Supabase, no events, no project context.
 *
 * GET /v22.0/{ad_account_id}/campaigns
 *   ?fields=id,name,objective,status,effective_status,
 *           daily_budget,lifetime_budget,budget_remaining,buying_type,
 *           special_ad_categories,created_time,updated_time
 *   &effective_status=["ACTIVE","PAUSED","DELETED","ARCHIVED",
 *                      "CAMPAIGN_PAUSED","ADSET_PAUSED"]
 *   &limit=500
 *
 * Includes DELETED/ARCHIVED so the sync engine can detect status
 * transitions (entity tables soft-delete via status='deleted').
 */

export type CampaignRecord = {
  meta_campaign_id: string;
  campaign_name: string | null;
  objective: string | null;
  campaign_status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  budget_remaining: number | null;
  buying_type: string | null;
  special_ad_categories: string[];
  created_time: string | null;
  updated_time: string | null;
};

export type FetchCampaignsResult = {
  campaigns: CampaignRecord[];
  abortReason: AbortReason | null;
  errorMessage: string | null;
  pagesFetched: number;
  rateLimitState: RateLimitState | null;
};

type CampaignRawRow = {
  id?: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string | number;
  lifetime_budget?: string | number;
  budget_remaining?: string | number;
  buying_type?: string;
  special_ad_categories?: string[];
  created_time?: string;
  updated_time?: string;
};

const FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "buying_type",
  "special_ad_categories",
  "created_time",
  "updated_time",
].join(",");

// Meta Graph entity endpoints do not support querying deleted/archived
// objects via effective_status. See ENTITY_FETCH_EFFECTIVE_STATUSES.
function buildUrl(token: string, metaAdAccountId: string): string {
  const url = new URL(`${META_GRAPH_BASE}/${metaAdAccountId}/campaigns`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", String(MAX_INSIGHT_ROWS_PER_REQUEST));
  url.searchParams.set(
    "effective_status",
    JSON.stringify(ENTITY_FETCH_EFFECTIVE_STATUSES)
  );
  url.searchParams.set("access_token", token);
  return url.toString();
}

function mapRow(raw: CampaignRawRow): CampaignRecord {
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new Error("campaign row missing id");
  }
  return {
    meta_campaign_id: raw.id,
    campaign_name: parseStringOrNull(raw.name),
    objective: parseStringOrNull(raw.objective),
    campaign_status: parseStringOrNull(raw.status),
    effective_status: parseStringOrNull(raw.effective_status),
    daily_budget: parseNumOrNull(raw.daily_budget),
    lifetime_budget: parseNumOrNull(raw.lifetime_budget),
    budget_remaining: parseNumOrNull(raw.budget_remaining),
    buying_type: parseStringOrNull(raw.buying_type),
    special_ad_categories: Array.isArray(raw.special_ad_categories)
      ? raw.special_ad_categories.filter((s): s is string => typeof s === "string")
      : [],
    created_time: parseStringOrNull(raw.created_time),
    updated_time: parseStringOrNull(raw.updated_time),
  };
}

export async function fetchCampaigns(opts: {
  token: string;
  metaAdAccountId: string;
  signal?: AbortSignal;
  deadline?: number;
}): Promise<FetchCampaignsResult> {
  const result: PaginatedResult<CampaignRecord> = await paginatedMetaGet({
    initialUrl: buildUrl(opts.token, opts.metaAdAccountId),
    signal: opts.signal,
    deadline: opts.deadline,
    mapItem: mapRow,
    scope: "campaigns",
  });

  return {
    campaigns: result.data,
    abortReason: result.abortReason,
    errorMessage: result.errorMessage,
    pagesFetched: result.pagesFetched,
    rateLimitState: result.rateLimitState,
  };
}
