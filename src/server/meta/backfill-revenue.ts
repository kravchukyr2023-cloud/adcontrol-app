import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import {
  pickRevenueFromActionValues,
  type MetaActionValue,
} from "./actions-normalizer";

/**
 * One-time backfill: recompute `revenue` on historical insight rows
 * from the preserved `raw_actions.action_values[]` JSONB payload.
 *
 * Background:
 *   Prior to Stage 12 the ingest pipeline wrote `revenue: null` on
 *   every insight row, even when Meta returned the monetary value
 *   under `action_values[]`. The full payload was preserved on each
 *   row's `raw_actions` column so revenue can be recomputed without
 *   re-fetching from Meta.
 *
 * Scope:
 *   - meta_ad_account_insights
 *   - meta_campaign_insights
 *   - meta_adset_insights
 *   - meta_ad_insights
 *   All four insight levels carry the same priority-OR risk and the
 *   same `raw_actions` JSONB; one helper handles them all.
 *
 * Pagination strategy: keyset over `id` (uuid). We do NOT use OFFSET
 * because rows we skip (when the chain yields null) stay in the
 * source set, so OFFSET would either advance past them silently or
 * loop forever on the same set. Keyset moves the cursor regardless
 * of update outcome.
 *
 * Idempotency: the WHERE filter is `revenue IS NULL` — once a row
 * gets a value it drops out of the next scan. Re-running picks up
 * any leftovers (e.g., from a partial timeout).
 */

const BATCH_SIZE = 500;
const DEFAULT_MAX_RUNTIME_MS = 55_000;

export type TableBackfillResult = {
  table: string;
  scanned: number;
  updated: number;
  /** Rows whose action_values had no positive chain entry — left as null. */
  skipped_no_value: number;
  /** Rows whose raw_actions JSON was malformed/empty — left as null. */
  skipped_malformed: number;
  /** Per-row UPDATE failures (rare; reported but not fatal). */
  errors: string[];
  /** True ⇒ stopped early because we hit the runtime budget. */
  truncated: boolean;
};

export type BackfillRevenueResult = {
  ok: boolean;
  tables: TableBackfillResult[];
  total_scanned: number;
  total_updated: number;
  truncated: boolean;
};

type ScanRow = { id: string; raw_actions: unknown };

function extractActionValues(raw: unknown): MetaActionValue[] | null {
  if (!raw || typeof raw !== "object") return null;
  const av = (raw as { action_values?: unknown }).action_values;
  if (!Array.isArray(av)) return null;
  // Trust the upstream shape; pickRevenueFromActionValues already
  // defends against bad entries internally.
  return av as MetaActionValue[];
}

type InsightTable =
  | "meta_ad_account_insights"
  | "meta_campaign_insights"
  | "meta_adset_insights"
  | "meta_ad_insights";

/**
 * Processing order: smaller, more user-facing tables first. Account
 * and campaign feed the Dashboard / project-card surfaces; adset and
 * ad are bigger and less queried. Truncation-friendly.
 */
const TABLES_IN_ORDER: readonly InsightTable[] = [
  "meta_ad_account_insights",
  "meta_campaign_insights",
  "meta_adset_insights",
  "meta_ad_insights",
];

async function backfillRevenueForTable(
  table: InsightTable,
  deadline: number
): Promise<TableBackfillResult> {
  const sb = getAdminSupabase();
  const result: TableBackfillResult = {
    table,
    scanned: 0,
    updated: 0,
    skipped_no_value: 0,
    skipped_malformed: 0,
    errors: [],
    truncated: false,
  };

  let cursor: string | null = null;

  while (true) {
    if (Date.now() >= deadline) {
      result.truncated = true;
      break;
    }

    let q = sb
      .from(table)
      .select("id, raw_actions")
      .is("revenue", null)
      .not("raw_actions", "is", null)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    if (cursor) q = q.gt("id", cursor);

    const { data, error } = await q;
    if (error) {
      result.errors.push(`scan: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as ScanRow[];
    if (rows.length === 0) break;

    result.scanned += rows.length;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      if (Date.now() >= deadline) {
        result.truncated = true;
        break;
      }

      const av = extractActionValues(row.raw_actions);
      if (av === null) {
        result.skipped_malformed++;
        continue;
      }
      if (av.length === 0) {
        result.skipped_no_value++;
        continue;
      }

      const revenue = pickRevenueFromActionValues(av);
      if (revenue === null) {
        // Priority chain found nothing positive — leave row null so a
        // future re-run of the backfill stays idempotent (cursor moves
        // on regardless).
        result.skipped_no_value++;
        continue;
      }

      const { error: updErr } = await sb
        .from(table)
        .update({
          revenue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updErr) {
        result.errors.push(`update id=${row.id}: ${updErr.message}`);
        continue;
      }
      result.updated++;
    }

    if (result.truncated) break;
    if (rows.length < BATCH_SIZE) break;
  }

  return result;
}

export async function backfillRevenueAllTables(opts?: {
  maxRuntimeMs?: number;
}): Promise<BackfillRevenueResult> {
  const startMs = Date.now();
  const budget = opts?.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
  const deadline = startMs + budget;

  const tables: TableBackfillResult[] = [];

  // Walk tables smallest → largest. If we run out of time mid-run,
  // the more user-facing tables (account, campaign) are guaranteed
  // to have been processed first; adset/ad get whatever's left, and
  // the caller can re-POST to finish them.
  for (const table of TABLES_IN_ORDER) {
    if (Date.now() >= deadline) {
      tables.push({
        table,
        scanned: 0,
        updated: 0,
        skipped_no_value: 0,
        skipped_malformed: 0,
        errors: [],
        truncated: true,
      });
      continue;
    }
    tables.push(await backfillRevenueForTable(table, deadline));
  }

  const total_scanned = tables.reduce((s, t) => s + t.scanned, 0);
  const total_updated = tables.reduce((s, t) => s + t.updated, 0);
  const truncated = tables.some((t) => t.truncated);
  const ok = tables.every((t) => t.errors.length === 0);

  return { ok, tables, total_scanned, total_updated, truncated };
}
