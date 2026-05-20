import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import type { AdRecord } from "./fetch-ads";
import {
  chunk,
  emptyResult,
  ENTITY_CHUNK_SIZE,
  nowIso,
  resolveStatusFromEffective,
  type UpsertResult,
} from "./upsert-helpers";

/**
 * Bulk UPSERT ads into meta_ads.
 *
 * Layer: DB only.
 *
 * ON CONFLICT (user_id, meta_ad_id) DO UPDATE — matches the UNIQUE
 * index meta_ads_user_ad_unique.
 *
 * Parent UUID FK (meta_adset_id_fk) resolved per chunk from
 * meta_adsets cache. NULL if parent not yet present.
 */
export async function upsertAds(params: {
  userId: string;
  rows: AdRecord[];
}): Promise<UpsertResult> {
  if (params.rows.length === 0) return emptyResult();

  const sb = getAdminSupabase();
  const now = nowIso();
  const batches = chunk(params.rows, ENTITY_CHUNK_SIZE);

  let persisted = 0;
  const errors: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const adsetIds = Array.from(
      new Set(
        batch
          .map((r) => r.meta_adset_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );

    const fkMap = new Map<string, string>();
    if (adsetIds.length > 0) {
      const { data: parents, error: lookupErr } = await sb
        .from("meta_adsets")
        .select("id, meta_adset_id")
        .eq("user_id", params.userId)
        .in("meta_adset_id", adsetIds);

      if (lookupErr) {
        errors.push(
          `chunk ${i + 1}/${batches.length} parent lookup: ${lookupErr.message}`
        );
        continue;
      }

      for (const p of (parents ?? []) as Array<{
        id: string;
        meta_adset_id: string;
      }>) {
        fkMap.set(p.meta_adset_id, p.id);
      }
    }

    const rows = batch.map((r) => {
      const s = resolveStatusFromEffective(r.effective_status, now);
      return {
        user_id: params.userId,
        meta_adset_id_fk: r.meta_adset_id
          ? fkMap.get(r.meta_adset_id) ?? null
          : null,
        meta_ad_id: r.meta_ad_id,
        meta_adset_id: r.meta_adset_id,
        meta_campaign_id: r.meta_campaign_id,
        ad_name: r.ad_name,
        ad_status: r.ad_status,
        effective_status: r.effective_status,
        creative_id: r.creative_id,
        creative_name: r.creative_name,
        created_time: r.created_time,
        updated_time: r.updated_time,
        status: s.status,
        deleted_at: s.deleted_at,
        last_synced_at: now,
        updated_at: now,
      };
    });

    const { error } = await sb
      .from("meta_ads")
      .upsert(rows, { onConflict: "user_id,meta_ad_id" });

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
