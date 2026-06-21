import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import {
  ShopifyAuthError,
  ShopifyError,
  ShopifyNotFoundError,
  ShopifyRateLimitError,
} from "@/lib/shopify/client";
import {
  fetchShopifyOrders,
  type ShopifyOrder,
} from "@/server/shopify/fetch-orders";
import {
  parseShopifyOrders,
  type ShopifyParseError,
} from "@/server/shopify/parse-orders";
import { upsertOrders } from "@/server/sheets/upsert-orders";
import {
  matchOrders,
  type MatchResult,
} from "@/server/attribution/match-orders";

/**
 * Shared core for Shopify sync. Mirrors the Stage 18 Google Sheets pipeline:
 *
 *   resolve sales_sources → fetch orders → parse → upsertOrders → matchOrders
 *
 * Used by (planned, Stage 26):
 *   - /api/shopify/sync     (manual trigger from Data Sources)
 *   - /api/cron/sync-all    (daily cron)
 *
 * Contract:
 *   - Pure outcome record (no HTTP statuses, no Response). Callers map status
 *     to whatever shape they need.
 *   - Marks the sales_source row with last_sync_at / last_successful_sync_at /
 *     status='error' as part of the run — callers never have to touch the row.
 *   - Per-order attribution is best-effort and non-fatal (same as Google).
 *
 * Incremental sync:
 *   `created_at_min` is set from `last_successful_sync_at` when present, so
 *   re-runs only pull new orders. First run pulls the full history (subject
 *   to MAX_PAGES truncation surfaced in `truncated`).
 */

export type ShopifySyncStatus =
  | "ok"
  | "token_expired"
  | "store_not_found"
  | "rate_limited"
  | "shopify_unavailable"
  | "all_failed"
  | "db_failed"
  | "source_missing"
  | "misconfigured";

export type ShopifySyncOutcome = {
  /** True if the source ended healthy. Zero-order syncs are still ok. */
  ok: boolean;
  status: ShopifySyncStatus;
  total_orders: number;
  inserted: number;
  updated: number;
  /** Orders the parser rejected (errors.length). */
  skipped: number;
  errors: ShopifyParseError[];
  /** True if pagination hit MAX_PAGES with more pages still available. */
  truncated: boolean;
  message?: string;
  attribution: MatchResult | null;
  error?: string;
  salesSourceId?: string;
};

export type ShopifySyncInput =
  | { userId: string; projectId: string; salesSourceId?: undefined }
  | { userId: string; projectId?: undefined; salesSourceId: string };

export async function syncShopifySource(
  input: ShopifySyncInput
): Promise<ShopifySyncOutcome> {
  const admin = getAdminSupabase();

  // ---------- 1. Resolve sales_sources row ----------
  type SourceRow = {
    id: string;
    project_id: string;
    source_config: Record<string, unknown> | null;
    last_successful_sync_at: string | null;
  };
  let sourceRow: SourceRow | null = null;

  if (input.salesSourceId) {
    const { data, error } = await admin
      .from("sales_sources")
      .select("id, project_id, source_config, last_successful_sync_at")
      .eq("id", input.salesSourceId)
      .eq("user_id", input.userId)
      .eq("source_type", "shopify")
      .maybeSingle();
    if (error) {
      return failOutcome({
        status: "db_failed",
        error: `sales_sources lookup: ${error.message}`,
      });
    }
    sourceRow = (data as SourceRow | null) ?? null;
  } else {
    const { data, error } = await admin
      .from("sales_sources")
      .select("id, project_id, source_config, last_successful_sync_at")
      .eq("user_id", input.userId)
      .eq("project_id", input.projectId)
      .eq("source_type", "shopify")
      .maybeSingle();
    if (error) {
      return failOutcome({
        status: "db_failed",
        error: `sales_sources lookup: ${error.message}`,
      });
    }
    sourceRow = (data as SourceRow | null) ?? null;
  }

  if (!sourceRow) {
    return failOutcome({
      status: "source_missing",
      error: "Shopify not connected",
    });
  }

  const sourceId = sourceRow.id;
  const projectId = sourceRow.project_id;
  const config = sourceRow.source_config ?? {};
  const shopUrl =
    typeof config.shop_url === "string" ? config.shop_url : null;
  const accessToken =
    typeof config.access_token === "string" ? config.access_token : null;

  if (!shopUrl || !accessToken) {
    return failOutcome({
      status: "misconfigured",
      error: "Shopify connection is missing shop URL or access token",
      salesSourceId: sourceId,
    });
  }

  // ---------- 2. Mark attempt ----------
  const startedIso = new Date().toISOString();
  await admin
    .from("sales_sources")
    .update({ last_sync_at: startedIso })
    .eq("id", sourceId);

  // ---------- 3. Fetch orders ----------
  let rawOrders: ShopifyOrder[];
  let truncated = false;
  try {
    const result = await fetchShopifyOrders({
      shopUrl,
      accessToken,
      since: sourceRow.last_successful_sync_at,
    });
    rawOrders = result.orders;
    truncated = result.truncated;
  } catch (err) {
    if (err instanceof ShopifyAuthError) {
      await markError(sourceId, "Connection expired. Please reconnect.");
      return failOutcome({
        status: "token_expired",
        error: "Connection expired. Please reconnect.",
        salesSourceId: sourceId,
      });
    }
    if (err instanceof ShopifyNotFoundError) {
      await markError(sourceId, "Store not found.");
      return failOutcome({
        status: "store_not_found",
        error: "Store not found",
        salesSourceId: sourceId,
      });
    }
    if (err instanceof ShopifyRateLimitError) {
      await markError(sourceId, "Shopify rate limit exceeded. Try again later.");
      return failOutcome({
        status: "rate_limited",
        error: "Shopify rate limit exceeded",
        salesSourceId: sourceId,
      });
    }
    const msg =
      err instanceof ShopifyError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Shopify fetch failed";
    await markError(sourceId, `Could not reach Shopify: ${msg}`);
    return failOutcome({
      status: "shopify_unavailable",
      error: msg,
      salesSourceId: sourceId,
    });
  }

  // ---------- 4. Zero-order short-circuit ----------
  if (rawOrders.length === 0) {
    await markSuccess(sourceId);
    return {
      ok: true,
      status: "ok",
      total_orders: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      truncated,
      attribution: null,
      message: sourceRow.last_successful_sync_at
        ? "No new orders since last sync."
        : "No orders found in store.",
      salesSourceId: sourceId,
    };
  }

  // ---------- 5. Parse ----------
  const { valid, errors } = parseShopifyOrders(rawOrders);

  if (valid.length === 0 && errors.length > 0) {
    const summary = errors
      .slice(0, 3)
      .map((e) => `order ${e.orderId}: ${e.reason}`)
      .join("; ");
    await markError(
      sourceId,
      `All orders failed parsing. ${summary}${
        errors.length > 3 ? ` (+${errors.length - 3} more)` : ""
      }`
    );
    return {
      ok: false,
      status: "all_failed",
      total_orders: rawOrders.length,
      inserted: 0,
      updated: 0,
      skipped: errors.length,
      errors: errors.slice(0, 10),
      truncated,
      attribution: null,
      error: "All orders failed parsing",
      salesSourceId: sourceId,
    };
  }

  // ---------- 6. Upsert ----------
  let upsertResult;
  try {
    upsertResult = await upsertOrders({
      userId: input.userId,
      projectId,
      salesSourceId: sourceId,
      orders: valid,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upsert failed";
    console.error(`[shopify sync-source ${sourceId}] upsert failed: ${msg}`);
    await markError(sourceId, `Failed to save orders: ${msg}`);
    return failOutcome({
      status: "db_failed",
      error: msg,
      salesSourceId: sourceId,
    });
  }

  if (
    upsertResult.errors.length > 0 &&
    upsertResult.inserted === 0 &&
    upsertResult.updated === 0
  ) {
    await markError(
      sourceId,
      `Failed to save orders: ${upsertResult.errors[0]}`
    );
    return {
      ok: false,
      status: "db_failed",
      total_orders: rawOrders.length,
      inserted: 0,
      updated: 0,
      skipped: errors.length,
      errors: errors.slice(0, 10),
      truncated,
      attribution: null,
      error: upsertResult.errors[0],
      salesSourceId: sourceId,
    };
  }

  await markSuccess(sourceId);

  // ---------- 7. Attribution (non-fatal) ----------
  let attribution: MatchResult | null = null;
  try {
    attribution = await matchOrders({ userId: input.userId, projectId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[shopify sync-source ${sourceId}] attribution failed: ${msg}`
    );
    attribution = null;
  }

  return {
    ok: true,
    status: "ok",
    total_orders: rawOrders.length,
    inserted: upsertResult.inserted,
    updated: upsertResult.updated,
    skipped: errors.length,
    errors: errors.slice(0, 10),
    truncated,
    attribution,
    salesSourceId: sourceId,
    ...(truncated
      ? {
          message:
            "Synced the most recent batch; more orders remain. Re-run sync to ingest the rest.",
        }
      : {}),
  };
}

function failOutcome(args: {
  status: ShopifySyncStatus;
  error: string;
  salesSourceId?: string;
}): ShopifySyncOutcome {
  return {
    ok: false,
    status: args.status,
    total_orders: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    truncated: false,
    attribution: null,
    error: args.error,
    salesSourceId: args.salesSourceId,
  };
}

async function markError(sourceId: string, message: string): Promise<void> {
  const admin = getAdminSupabase();
  await admin
    .from("sales_sources")
    .update({
      status: "error",
      last_error: message,
      last_error_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
}

async function markSuccess(sourceId: string): Promise<void> {
  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  await admin
    .from("sales_sources")
    .update({
      status: "active",
      last_successful_sync_at: now,
      last_error: null,
      last_error_at: null,
    })
    .eq("id", sourceId);
}

/**
 * Maps a ShopifySyncStatus to the HTTP status code a manual endpoint should
 * return. Mirrors statusToHttpCode in the Google sync.
 */
export function shopifyStatusToHttpCode(status: ShopifySyncStatus): number {
  switch (status) {
    case "ok":
    case "all_failed":
      return 200;
    case "source_missing":
    case "store_not_found":
      return 404;
    case "token_expired":
      return 401;
    case "misconfigured":
      return 400;
    case "rate_limited":
      return 429;
    case "shopify_unavailable":
      return 502;
    case "db_failed":
      return 500;
  }
}
