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
 * Bulk UPSERT account-level daily insights into meta_ad_account_insights.
 *
 * Layer: DB only.
 *
 * ON CONFLICT (user_id, meta_ad_account_id, date) DO UPDATE — matches
 * meta_aa_insights_resource_date_unique.
 *
 * Idempotency: same (user, AA, date) tuple upserts in place. Re-syncing
 * the 7-day overlap window corrects Meta's late-attribution backfills.
 *
 * Soft-delete N/A: insight rows have no status. Parent AA deletion
 * sets meta_ad_account_id_fk to NULL (ON DELETE SET NULL); the row
 * remains addressable via the stable text id.
 */
export async function upsertAccountInsights(params: {
  userId: string;
  /** Internal UUID of the parent meta_ad_accounts row (for joins). May be NULL. */
  metaAdAccountIdFk: string | null;
  /** Stable text Meta id (e.g. "act_xxx") — part of UNIQUE. */
  metaAdAccountId: string;
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
    const rows = batch.map((r) => ({
      user_id: params.userId,
      meta_ad_account_id_fk: params.metaAdAccountIdFk,
      meta_ad_account_id: params.metaAdAccountId,
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
      revenue: r.revenue,
      currency: params.currency,
      raw_actions: r.raw_actions,
      last_synced_at: now,
      updated_at: now,
    }));

    const { error } = await sb
      .from("meta_ad_account_insights")
      .upsert(rows, { onConflict: "user_id,meta_ad_account_id,date" });

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
