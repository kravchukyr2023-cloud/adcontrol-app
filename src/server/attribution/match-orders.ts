import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";

/**
 * Attribution engine — matches orders → Meta entities via UTM fields.
 *
 * ============================================================================
 *  AdControl PLATFORM-WIDE UTM CONTRACT  (NOT user-configurable)
 * ============================================================================
 *
 * Every AdControl user MUST tag their Meta ads with these UTM parameters
 * for Real ROAS attribution to work. This is the platform contract,
 * analogous to the strict 12-column Google Sheets template enforced by
 * /api/google/sheets/select. AdControl dictates the format; users comply.
 *
 *     utm_source   = Meta Campaign name   → meta_campaigns.campaign_name
 *     utm_medium   = Meta Adset name      → meta_adsets.adset_name
 *     utm_campaign = Meta Ad name         → meta_ads.ad_name
 *
 * Do NOT make this mapping configurable. If a customer needs a different
 * UTM scheme, they configure their Meta ads to match AdControl's contract,
 * not the other way around. Changing the mapping below silently breaks
 * Real ROAS for every project on the platform.
 * ============================================================================
 *
 * Re-matching policy:
 *   - Only orders in attribution_status ∈ {'unmatched', 'partial'} are
 *     touched. 'matched' rows are immutable here; 'manual' (user override)
 *     is preserved across syncs.
 *   - Per-row UPDATE is skipped when nothing changes — idempotent re-runs
 *     touch zero rows.
 *
 * Normalization (required for both sides of the comparison):
 *   - "+" → " "   (URL form-encoded spaces)
 *   - decodeURIComponent  (UTF-8 percent-encoding, e.g. "%D0%97%D0%B5%D1%80%D0%BD%D0%BE")
 *   - trim + lowercase
 *   - decodeURIComponent failures fall back to the "+ → space" form so a
 *     broken row never poisons the whole sync.
 */

export type MatchResult = {
  matched: number;
  partial: number;
  unmatched: number;
  /** Rows actually touched by an UPDATE (the rest were already correct). */
  updated: number;
  /** Total rows considered (unmatched + partial before re-run). */
  considered: number;
};

const UPDATE_CONCURRENCY = 25;

/**
 * URL-decodes a UTM value and normalizes it for case-insensitive comparison
 * against a Meta entity name. Exported for unit tests + sharing with any
 * future debug tooling.
 */
export function normalize(raw: string | null | undefined): string {
  if (!raw) return "";
  // "+" is the form-encoded space, decodeURIComponent does NOT handle it.
  const plusReplaced = raw.replace(/\+/g, " ");
  let decoded: string;
  try {
    decoded = decodeURIComponent(plusReplaced);
  } catch {
    // Malformed % sequences — accept the plus-replaced form rather than
    // crashing the whole match run on one bad row.
    decoded = plusReplaced;
  }
  return decoded.trim().toLowerCase();
}

type OrderRow = {
  id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  attribution_status: string;
  matched_meta_campaign_id: string | null;
  matched_meta_adset_id: string | null;
  matched_meta_ad_id: string | null;
};

export async function matchOrders(params: {
  userId: string;
  projectId: string;
}): Promise<MatchResult> {
  const { userId, projectId } = params;
  const admin = getAdminSupabase();

  // 1. Pull only the columns we need from re-matchable orders.
  const { data: orderRows, error: orderErr } = await admin
    .from("orders")
    .select(
      "id, utm_source, utm_medium, utm_campaign, attribution_status, matched_meta_campaign_id, matched_meta_adset_id, matched_meta_ad_id"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("attribution_status", ["unmatched", "partial"]);

  if (orderErr) {
    throw new Error(`orders fetch: ${orderErr.message}`);
  }

  const orders = (orderRows ?? []) as OrderRow[];
  if (orders.length === 0) {
    return { matched: 0, partial: 0, unmatched: 0, updated: 0, considered: 0 };
  }

  // 2. Pull all Meta entities for this user in three flat queries. Entities
  //    are user-scoped (not project-scoped) — Meta UTM tags don't carry a
  //    project identifier, so matching has to be global per user. If two
  //    projects share an entity name, the newest wins (rare; ad accounts
  //    don't reuse exact names across product lines in practice).
  const [campaignsRes, adsetsRes, adsRes] = await Promise.all([
    admin
      .from("meta_campaigns")
      .select("id, campaign_name, created_time, created_at")
      .eq("user_id", userId),
    admin
      .from("meta_adsets")
      .select("id, adset_name, created_time, created_at")
      .eq("user_id", userId),
    admin
      .from("meta_ads")
      .select("id, ad_name, created_time, created_at")
      .eq("user_id", userId),
  ]);

  if (campaignsRes.error) {
    throw new Error(`meta_campaigns fetch: ${campaignsRes.error.message}`);
  }
  if (adsetsRes.error) {
    throw new Error(`meta_adsets fetch: ${adsetsRes.error.message}`);
  }
  if (adsRes.error) {
    throw new Error(`meta_ads fetch: ${adsRes.error.message}`);
  }

  const campaignByName = buildEntityMap(
    (campaignsRes.data ?? []) as Array<{
      id: string;
      campaign_name: string | null;
      created_time: string | null;
      created_at: string;
    }>,
    "campaign_name"
  );
  const adsetByName = buildEntityMap(
    (adsetsRes.data ?? []) as Array<{
      id: string;
      adset_name: string | null;
      created_time: string | null;
      created_at: string;
    }>,
    "adset_name"
  );
  const adByName = buildEntityMap(
    (adsRes.data ?? []) as Array<{
      id: string;
      ad_name: string | null;
      created_time: string | null;
      created_at: string;
    }>,
    "ad_name"
  );

  // 3. Resolve attribution for every order, batch the UPDATEs.
  const now = new Date().toISOString();
  let matched = 0;
  let partial = 0;
  let unmatched = 0;
  let updated = 0;

  const updates: Array<{
    id: string;
    matched_meta_campaign_id: string | null;
    matched_meta_adset_id: string | null;
    matched_meta_ad_id: string | null;
    attribution_status: "matched" | "partial" | "unmatched";
    attribution_matched_at: string | null;
  }> = [];

  for (const order of orders) {
    const campaignId =
      order.utm_source && order.utm_source.length > 0
        ? campaignByName.get(normalize(order.utm_source)) ?? null
        : null;
    const adsetId =
      order.utm_medium && order.utm_medium.length > 0
        ? adsetByName.get(normalize(order.utm_medium)) ?? null
        : null;
    const adId =
      order.utm_campaign && order.utm_campaign.length > 0
        ? adByName.get(normalize(order.utm_campaign)) ?? null
        : null;

    let newStatus: "matched" | "partial" | "unmatched";
    if (adId) newStatus = "matched";
    else if (campaignId || adsetId) newStatus = "partial";
    else newStatus = "unmatched";

    if (newStatus === "matched") matched += 1;
    else if (newStatus === "partial") partial += 1;
    else unmatched += 1;

    const anyMatch = !!(campaignId || adsetId || adId);
    const matchedAt = anyMatch ? now : null;

    // Skip the UPDATE when nothing actually changes. matched_at is treated
    // as "set once" — we don't overwrite the original timestamp on no-op runs.
    const unchanged =
      order.attribution_status === newStatus &&
      (order.matched_meta_campaign_id ?? null) === campaignId &&
      (order.matched_meta_adset_id ?? null) === adsetId &&
      (order.matched_meta_ad_id ?? null) === adId;
    if (unchanged) continue;

    updates.push({
      id: order.id,
      matched_meta_campaign_id: campaignId,
      matched_meta_adset_id: adsetId,
      matched_meta_ad_id: adId,
      attribution_status: newStatus,
      // Preserve previous timestamp if it existed and this run made no new
      // matches — but since `unchanged` short-circuits no-ops, anything that
      // reaches here changed at least one column and deserves a fresh stamp.
      attribution_matched_at: matchedAt,
    });
  }

  // Apply updates with bounded concurrency.
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const batch = updates.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((u) =>
        admin
          .from("orders")
          .update({
            matched_meta_campaign_id: u.matched_meta_campaign_id,
            matched_meta_adset_id: u.matched_meta_adset_id,
            matched_meta_ad_id: u.matched_meta_ad_id,
            attribution_status: u.attribution_status,
            attribution_matched_at: u.attribution_matched_at,
          })
          .eq("id", u.id)
          .eq("user_id", userId)
      )
    );
    for (const r of results) {
      if (r.error) {
        console.error(
          `[matchOrders] update failed: ${r.error.message}`
        );
      } else {
        updated += 1;
      }
    }
  }

  return {
    matched,
    partial,
    unmatched,
    updated,
    considered: orders.length,
  };
}

/**
 * Builds a `normalized name → entity.id` map. When two entities share a
 * normalized name we keep the newer (created_time desc, then created_at
 * desc) — reflects the common case of a campaign being recreated under
 * the same name after pausing the old one.
 */
function buildEntityMap<
  T extends {
    id: string;
    created_time: string | null;
    created_at: string;
  } & Record<string, unknown>
>(rows: T[], nameField: keyof T): Map<string, string> {
  const best = new Map<string, { id: string; sort: number }>();
  for (const row of rows) {
    const rawName = row[nameField];
    if (typeof rawName !== "string" || rawName.length === 0) continue;
    const key = normalize(rawName);
    if (!key) continue;

    const sort = createdSortKey(row.created_time, row.created_at);
    const existing = best.get(key);
    if (!existing || sort > existing.sort) {
      best.set(key, { id: row.id, sort });
    }
  }
  const result = new Map<string, string>();
  for (const [k, v] of best) {
    result.set(k, v.id);
  }
  return result;
}

function createdSortKey(
  createdTime: string | null,
  createdAt: string
): number {
  // Prefer Meta's created_time (the timestamp on Facebook), fall back to
  // our DB created_at when Meta didn't return it.
  if (createdTime) {
    const t = Date.parse(createdTime);
    if (Number.isFinite(t)) return t;
  }
  const a = Date.parse(createdAt);
  return Number.isFinite(a) ? a : 0;
}
