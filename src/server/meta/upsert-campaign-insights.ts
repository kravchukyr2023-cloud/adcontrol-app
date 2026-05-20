import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import type { InsightRecord } from "./fetch-insights";
import {
  chunk,
  emptyResult,
  INSIGHT_CHUNK_SIZE,
  nowIso,
  type UpsertResult,
} from "./upsert-helpers";

/**
 * Bulk UPSERT campaign-level daily insights into meta_campaign_insights.
 *
 * Layer: DB only.
 *
 * ON CONFLICT (user_id, meta_campaign_id, date) DO UPDATE — matches
 * meta_camp_insights_resource_date_unique.
 *
 * Parent UUID FK resolved per chunk from meta_campaigns cache.
 * Missing parent → FK NULL (text id still present for UNIQUE).
 *
 * Caller is expected to pass InsightRecord rows with level='campaign'.
 * This is not enforced by the upserter — the engine is responsible
 * for routing each fetcher result to the correct upserter.
 */
export async function upsertCampaignInsights(params: {
  userId: string;
  /** Currency snapshot from the ad account at sync time. */
  currency: string | null;
  rows: InsightRecord[];
}): Promise<UpsertResult> {
  if (params.rows.length === 0) return emptyResult();

  const sb = getAdminSupabase();
  const now = nowIso();
  const batches = chunk(params.rows, INSIGHT_CHUNK_SIZE);

  let persisted = 0;
  const errors: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const campaignIds = Array.from(
      new Set(
        batch
          .map((r) => r.resource_id)
          .filter((id) => typeof id === "string" && id.length > 0)
      )
    );

    const fkMap = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: parents, error: lookupErr } = await sb
        .from("meta_campaigns")
        .select("id, meta_campaign_id")
        .eq("user_id", params.userId)
        .in("meta_campaign_id", campaignIds);

      if (lookupErr) {
        errors.push(
          `chunk ${i + 1}/${batches.length} parent lookup: ${lookupErr.message}`
        );
        continue;
      }

      for (const p of (parents ?? []) as Array<{
        id: string;
        meta_campaign_id: string;
      }>) {
        fkMap.set(p.meta_campaign_id, p.id);
      }
    }

    const rows = batch.map((r) => ({
      user_id: params.userId,
      meta_campaign_id_fk: fkMap.get(r.resource_id) ?? null,
      meta_campaign_id: r.resource_id,
      date: r.date,
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      unique_clicks: r.unique_clicks,
      ctr: r.ctr,
      cpc: r.cpc,
      cpm: r.cpm,
      reach: r.reach,
      frequency: r.frequency,
      purchases: r.purchases,
      leads: r.leads,
      revenue: null,
      currency: params.currency,
      raw_actions: r.raw_actions,
      last_synced_at: now,
      updated_at: now,
    }));

    const { error } = await sb
      .from("meta_campaign_insights")
      .upsert(rows, { onConflict: "user_id,meta_campaign_id,date" });

    if (error) {
      errors.push(`chunk ${i + 1}/${batches.length}: ${error.message}`);
    } else {
      persisted += batch.length;
    }
  }

  return {
    ok: errors.length === 0,
    persisted,
    attempted: params.rows.length,
    chunks: batches.length,
    errors,
  };
}
