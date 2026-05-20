import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import type { AdsetRecord } from "./fetch-adsets";
import {
  chunk,
  emptyResult,
  ENTITY_CHUNK_SIZE,
  nowIso,
  resolveStatusFromEffective,
  type UpsertResult,
} from "./upsert-helpers";

/**
 * Bulk UPSERT ad sets into meta_adsets.
 *
 * Layer: DB only.
 *
 * ON CONFLICT (user_id, meta_adset_id) DO UPDATE — matches the UNIQUE
 * index meta_adsets_user_adset_unique.
 *
 * Parent UUID FK (meta_campaign_id_fk) is resolved per chunk by looking
 * up meta_campaigns where (user_id, meta_campaign_id IN (...)). If the
 * parent campaign isn't yet cached, the FK is left NULL (ON DELETE
 * SET NULL semantics tolerate this). The denormalized text id
 * (meta_campaign_id) is always populated.
 */
export async function upsertAdsets(params: {
  userId: string;
  rows: AdsetRecord[];
}): Promise<UpsertResult> {
  if (params.rows.length === 0) return emptyResult();

  const sb = getAdminSupabase();
  const now = nowIso();
  const batches = chunk(params.rows, ENTITY_CHUNK_SIZE);

  let persisted = 0;
  const errors: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const campaignIds = Array.from(
      new Set(
        batch
          .map((r) => r.meta_campaign_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
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

    const rows = batch.map((r) => {
      const s = resolveStatusFromEffective(r.effective_status, now);
      return {
        user_id: params.userId,
        meta_campaign_id_fk: r.meta_campaign_id
          ? fkMap.get(r.meta_campaign_id) ?? null
          : null,
        meta_adset_id: r.meta_adset_id,
        meta_campaign_id: r.meta_campaign_id,
        adset_name: r.adset_name,
        adset_status: r.adset_status,
        effective_status: r.effective_status,
        daily_budget: r.daily_budget,
        lifetime_budget: r.lifetime_budget,
        bid_amount: r.bid_amount,
        optimization_goal: r.optimization_goal,
        billing_event: r.billing_event,
        targeting: r.targeting,
        start_time: r.start_time,
        end_time: r.end_time,
        created_time: r.created_time,
        updated_time: r.updated_time,
        status: s.status,
        deleted_at: s.deleted_at,
        last_synced_at: now,
        updated_at: now,
      };
    });

    const { error } = await sb
      .from("meta_adsets")
      .upsert(rows, { onConflict: "user_id,meta_adset_id" });

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
