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
 * Bulk UPSERT ad-level daily insights into meta_ad_insights.
 *
 * Layer: DB only. Highest volume insight table — chunking is the
 * critical safety mechanism here.
 *
 * ON CONFLICT (user_id, meta_ad_id, date) DO UPDATE — matches
 * meta_ad_insights_resource_date_unique.
 */
export async function upsertAdInsights(params: {
  userId: string;
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

    const adIds = Array.from(
      new Set(
        batch
          .map((r) => r.resource_id)
          .filter((id) => typeof id === "string" && id.length > 0)
      )
    );

    const fkMap = new Map<string, string>();
    if (adIds.length > 0) {
      const { data: parents, error: lookupErr } = await sb
        .from("meta_ads")
        .select("id, meta_ad_id")
        .eq("user_id", params.userId)
        .in("meta_ad_id", adIds);

      if (lookupErr) {
        errors.push(
          `chunk ${i + 1}/${batches.length} parent lookup: ${lookupErr.message}`
        );
        continue;
      }

      for (const p of (parents ?? []) as Array<{
        id: string;
        meta_ad_id: string;
      }>) {
        fkMap.set(p.meta_ad_id, p.id);
      }
    }

    const rows = batch.map((r) => ({
      user_id: params.userId,
      meta_ad_id_fk: fkMap.get(r.resource_id) ?? null,
      meta_ad_id: r.resource_id,
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
      .from("meta_ad_insights")
      .upsert(rows, { onConflict: "user_id,meta_ad_id,date" });

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
