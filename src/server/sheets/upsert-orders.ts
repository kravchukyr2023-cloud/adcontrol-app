import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import type { ParsedOrder } from "./parse-rows";

/**
 * Upserts parsed Google Sheets rows into `orders`.
 *
 * Why select-then-split instead of `.upsert(onConflict=...)`:
 *
 *   `orders` has a *partial* unique index
 *     CREATE UNIQUE INDEX orders_unique_external
 *       ON orders(user_id, sales_source_id, order_external_id)
 *       WHERE sales_source_id IS NOT NULL;
 *
 *   PostgREST's `onConflict` parameter does not pass the partial-index
 *   predicate to Postgres, so ON CONFLICT inference is not guaranteed.
 *   The Stage 17 sales_sources writer hit the same problem.
 *
 *   On top of that we need different update semantics: existing rows must
 *   PRESERVE attribution_status / matched_meta_* (set by the Stage 21
 *   attribution job). A plain upsert would clobber them with the defaults
 *   from the inserted payload. Splitting into INSERT (new) and UPDATE
 *   (existing, with attribution columns omitted) makes that explicit.
 */

const INSERT_CHUNK = 500;
const UPDATE_CONCURRENCY = 25;

export type UpsertOrdersResult = {
  inserted: number;
  updated: number;
  errors: string[];
};

export async function upsertOrders(params: {
  userId: string;
  projectId: string;
  salesSourceId: string;
  orders: ParsedOrder[];
}): Promise<UpsertOrdersResult> {
  const { userId, projectId, salesSourceId, orders } = params;
  if (orders.length === 0) {
    return { inserted: 0, updated: 0, errors: [] };
  }

  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  const errors: string[] = [];

  // 1. Find external IDs already present for this source. Looking up by
  //    `sales_source_id` ensures the partial index is the one used.
  const externalIds = Array.from(
    new Set(orders.map((o) => o.order_external_id))
  );
  const existing = new Set<string>();

  // Supabase JS clamps `.in()` to a few thousand values per call before the
  // URL gets uncomfortably long. Chunk the lookup defensively.
  for (let i = 0; i < externalIds.length; i += INSERT_CHUNK) {
    const slice = externalIds.slice(i, i + INSERT_CHUNK);
    const { data, error } = await admin
      .from("orders")
      .select("order_external_id")
      .eq("user_id", userId)
      .eq("sales_source_id", salesSourceId)
      .in("order_external_id", slice);

    if (error) {
      errors.push(`existing lookup: ${error.message}`);
      // Continue — worst case some rows hit a unique-violation on insert and
      // are correctly skipped by the duplicate filter below.
      continue;
    }
    for (const row of (data ?? []) as Array<{ order_external_id: string }>) {
      existing.add(row.order_external_id);
    }
  }

  const toInsert = orders.filter(
    (o) => !existing.has(o.order_external_id)
  );
  const toUpdate = orders.filter((o) => existing.has(o.order_external_id));

  // 2. Bulk insert new orders. attribution_status defaults to 'unmatched'
  //    via the table default, so we omit it; Stage 21 will flip it.
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const batch = toInsert.slice(i, i + INSERT_CHUNK);
    const rows = batch.map((o) => ({
      user_id: userId,
      project_id: projectId,
      sales_source_id: salesSourceId,
      order_date: o.order_date,
      order_external_id: o.order_external_id,
      revenue: o.revenue,
      currency: o.currency,
      customer_name: o.customer_name,
      customer_email: o.customer_email,
      product_name: o.product_name,
      utm_source: o.utm_source,
      utm_medium: o.utm_medium,
      utm_campaign: o.utm_campaign,
      utm_content: o.utm_content,
      utm_term: o.utm_term,
      source_synced_at: now,
    }));

    const { error } = await admin.from("orders").insert(rows);
    if (error) {
      errors.push(`insert chunk ${i / INSERT_CHUNK + 1}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  // 3. Update existing rows. We deliberately omit attribution_status,
  //    matched_meta_*, attribution_matched_at, and created_at so the
  //    Stage 21 attribution job's work is preserved across re-syncs.
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
    const batch = toUpdate.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (o) => {
        const { error } = await admin
          .from("orders")
          .update({
            order_date: o.order_date,
            revenue: o.revenue,
            currency: o.currency,
            customer_name: o.customer_name,
            customer_email: o.customer_email,
            product_name: o.product_name,
            utm_source: o.utm_source,
            utm_medium: o.utm_medium,
            utm_campaign: o.utm_campaign,
            utm_content: o.utm_content,
            utm_term: o.utm_term,
            source_synced_at: now,
          })
          .eq("user_id", userId)
          .eq("sales_source_id", salesSourceId)
          .eq("order_external_id", o.order_external_id);
        return error;
      })
    );
    for (let j = 0; j < results.length; j++) {
      const err = results[j];
      if (err) {
        errors.push(
          `update ${batch[j].order_external_id}: ${err.message}`
        );
      } else {
        updated += 1;
      }
    }
  }

  return { inserted, updated, errors };
}
