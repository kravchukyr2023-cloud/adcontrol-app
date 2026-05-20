import "server-only";
import { META_GRAPH_BASE } from "./meta-config";
import {
  ENTITY_FETCH_EFFECTIVE_STATUSES,
  MAX_INSIGHT_ROWS_PER_REQUEST,
} from "./sync-constants";
import {
  paginatedMetaGet,
  parseStringOrNull,
  type AbortReason,
  type PaginatedResult,
} from "./sync-fetch-helpers";
import type { RateLimitState } from "./rate-limit";

/**
 * Fetcher: Meta ads under an ad account.
 *
 * Pure I/O + parse. No DB, no Supabase, no events, no project context.
 *
 * GET /v22.0/{ad_account_id}/ads
 *   ?fields=id,name,adset_id,campaign_id,status,effective_status,
 *           creative{id,name},created_time,updated_time
 *   &effective_status=[...]
 *   &limit=500
 *
 * V1: creative captured as id + name only. Image / thumbnail URLs are
 * NOT fetched (deferred to Phase 4 via separate creative-fetch path).
 */

export type AdRecord = {
  meta_ad_id: string;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  ad_name: string | null;
  ad_status: string | null;
  effective_status: string | null;
  creative_id: string | null;
  creative_name: string | null;
  created_time: string | null;
  updated_time: string | null;
};

export type FetchAdsResult = {
  ads: AdRecord[];
  abortReason: AbortReason | null;
  errorMessage: string | null;
  pagesFetched: number;
  rateLimitState: RateLimitState | null;
};

type AdRawCreative = {
  id?: string;
  name?: string;
};

type AdRawRow = {
  id?: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  creative?: AdRawCreative;
  created_time?: string;
  updated_time?: string;
};

const FIELDS = [
  "id",
  "name",
  "adset_id",
  "campaign_id",
  "status",
  "effective_status",
  "creative{id,name}",
  "created_time",
  "updated_time",
].join(",");

// Meta Graph entity endpoints do not support querying deleted/archived
// objects via effective_status. See ENTITY_FETCH_EFFECTIVE_STATUSES.
function buildUrl(token: string, metaAdAccountId: string): string {
  const url = new URL(`${META_GRAPH_BASE}/${metaAdAccountId}/ads`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", String(MAX_INSIGHT_ROWS_PER_REQUEST));
  url.searchParams.set(
    "effective_status",
    JSON.stringify(ENTITY_FETCH_EFFECTIVE_STATUSES)
  );
  url.searchParams.set("access_token", token);
  return url.toString();
}

function mapRow(raw: AdRawRow): AdRecord {
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new Error("ad row missing id");
  }
  return {
    meta_ad_id: raw.id,
    meta_adset_id: parseStringOrNull(raw.adset_id),
    meta_campaign_id: parseStringOrNull(raw.campaign_id),
    ad_name: parseStringOrNull(raw.name),
    ad_status: parseStringOrNull(raw.status),
    effective_status: parseStringOrNull(raw.effective_status),
    creative_id: parseStringOrNull(raw.creative?.id),
    creative_name: parseStringOrNull(raw.creative?.name),
    created_time: parseStringOrNull(raw.created_time),
    updated_time: parseStringOrNull(raw.updated_time),
  };
}

export async function fetchAds(opts: {
  token: string;
  metaAdAccountId: string;
  signal?: AbortSignal;
  deadline?: number;
}): Promise<FetchAdsResult> {
  const result: PaginatedResult<AdRecord> = await paginatedMetaGet({
    initialUrl: buildUrl(opts.token, opts.metaAdAccountId),
    signal: opts.signal,
    deadline: opts.deadline,
    mapItem: mapRow,
    scope: "ads",
  });

  return {
    ads: result.data,
    abortReason: result.abortReason,
    errorMessage: result.errorMessage,
    pagesFetched: result.pagesFetched,
    rateLimitState: result.rateLimitState,
  };
}
