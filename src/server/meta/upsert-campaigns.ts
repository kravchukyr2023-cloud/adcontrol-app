import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import type { CampaignRecord } from "./fetch-campaigns";
import {
  chunk,
  emptyResult,
  ENTITY_CHUNK_SIZE,
  nowIso,
  resolveStatusFromEffective,
  type UpsertResult,
} from "./upsert-helpers";

/**
 * Bulk UPSERT campaigns into meta_campaigns.
 *
 * Layer: DB only. No Meta API, no events, no sync_states.
 *
 * ON CONFLICT (user_id, meta_campaign_id) DO UPDATE — matches the
 * UNIQUE index meta_campaigns_user_campaign_unique.
 *
 * Chunks of ENTITY_CHUNK_SIZE rows committed independently — partial
 * success preserved if a later chunk fails.
 */
export async function upsertCampaigns(params: {
  userId: string;
  /** Internal UUID of the parent meta_ad_accounts row. */
  metaAdAccountIdFk: string;
  rows: CampaignRecord[];
}): Promise<UpsertResult> {
  if (params.rows.length === 0) return emptyResult();

  const sb = getAdminSupabase();
  const now = nowIso();
  const batches = chunk(params.rows, ENTITY_CHUNK_SIZE);

  let persisted = 0;
  const errors: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const rows = batch.map((r) => {
      const s = resolveStatusFromEffective(r.effective_status, now);
      return {
        user_id: params.userId,
        meta_ad_account_id: params.metaAdAccountIdFk,
        meta_campaign_id: r.meta_campaign_id,
        campaign_name: r.campaign_name,
        objective: r.objective,
        campaign_status: r.campaign_status,
        effective_status: r.effective_status,
        daily_budget: r.daily_budget,
        lifetime_budget: r.lifetime_budget,
        budget_remaining: r.budget_remaining,
        buying_type: r.buying_type,
        special_ad_categories: r.special_ad_categories,
        created_time: r.created_time,
        updated_time: r.updated_time,
        status: s.status,
        deleted_at: s.deleted_at,
        last_synced_at: now,
        updated_at: now,
      };
    });

    const { error } = await sb
      .from("meta_campaigns")
      .upsert(rows, { onConflict: "user_id,meta_campaign_id" });

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
