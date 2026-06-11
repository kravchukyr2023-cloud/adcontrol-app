import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { refreshGoogleToken } from "@/lib/google/oauth";
import {
  getSheetRows,
  GoogleSheetsAuthError,
  GoogleSheetsForbiddenError,
  GoogleSheetsNotFoundError,
} from "@/lib/google/sheets";
import { parseSheetRows, type RowError } from "@/server/sheets/parse-rows";
import { upsertOrders } from "@/server/sheets/upsert-orders";
import {
  matchOrders,
  type MatchResult,
} from "@/server/attribution/match-orders";

/**
 * Shared core for Google Sheets sync.
 *
 * Used by:
 *   - /api/google/sheets/sync   (manual trigger from Data Sources)
 *   - /api/cron/sync-all        (daily cron, Stage 20)
 *   - global topbar Sync button (via the manual endpoint)
 *
 * Contract:
 *   - Pure outcome record (no HTTP statuses, no Response object). Callers
 *     map `status` to whatever shape they need (HTTP code, log line,
 *     telemetry counter).
 *   - Marks the sales_source row with last_sync_at / last_successful_sync_at /
 *     status='error' as part of the run — callers never have to touch the
 *     row.
 *   - Per-row attribution is run inline (best-effort, non-fatal).
 */

const MAX_SYNC_ROWS = 1000;

export type SyncSourceStatus =
  | "ok"
  | "no_spreadsheet"
  | "token_expired"
  | "spreadsheet_not_found"
  | "forbidden"
  | "all_failed"
  | "db_failed"
  | "read_failed"
  | "source_missing";

export type SyncSourceOutcome = {
  /** True only if at least one row landed (insert or update) AND the source ended healthy. */
  ok: boolean;
  status: SyncSourceStatus;
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: RowError[];
  truncated: boolean;
  message?: string;
  attribution: MatchResult | null;
  /** Human-readable error text suitable for the UI banner. */
  error?: string;
  /** sales_sources.id of the row that was touched, when known. */
  salesSourceId?: string;
};

export type SyncSourceInput =
  | { userId: string; projectId: string; salesSourceId?: undefined }
  | { userId: string; projectId?: undefined; salesSourceId: string };

/**
 * Syncs one Google Sheets source. Accepts EITHER `projectId` (resolves the
 * single `google_sheets` row for that project) OR `salesSourceId` (skips
 * the lookup — used by the cron loop which already has the row in hand).
 */
export async function syncGoogleSheetsSource(
  input: SyncSourceInput
): Promise<SyncSourceOutcome> {
  const admin = getAdminSupabase();

  // ---------- 1. Resolve the sales_sources row ----------
  type SourceRow = {
    id: string;
    project_id: string;
    source_config: Record<string, unknown> | null;
  };
  let sourceRow: SourceRow | null = null;

  if (input.salesSourceId) {
    const { data, error } = await admin
      .from("sales_sources")
      .select("id, project_id, source_config")
      .eq("id", input.salesSourceId)
      .eq("user_id", input.userId)
      .eq("source_type", "google_sheets")
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
      .select("id, project_id, source_config")
      .eq("user_id", input.userId)
      .eq("project_id", input.projectId)
      .eq("source_type", "google_sheets")
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
      error: "Google Sheets not connected",
    });
  }

  const sourceId = sourceRow.id;
  const projectId = sourceRow.project_id;
  const config = sourceRow.source_config ?? {};

  const refreshToken =
    typeof config.refresh_token === "string" ? config.refresh_token : null;
  const spreadsheetId =
    typeof config.spreadsheet_id === "string" ? config.spreadsheet_id : null;
  const sheetName =
    typeof config.sheet_name === "string" && config.sheet_name.length > 0
      ? (config.sheet_name as string)
      : undefined;

  if (!refreshToken) {
    return failOutcome({
      status: "source_missing",
      error: "Google Sheets not connected",
      salesSourceId: sourceId,
    });
  }

  if (!spreadsheetId) {
    return failOutcome({
      status: "no_spreadsheet",
      error: "No validated spreadsheet. Pick a spreadsheet first.",
      salesSourceId: sourceId,
    });
  }

  // ---------- 2. Mark attempt ----------
  const startedIso = new Date().toISOString();
  await admin
    .from("sales_sources")
    .update({ last_sync_at: startedIso })
    .eq("id", sourceId);

  // ---------- 3. Token refresh ----------
  let accessToken: string;
  try {
    const refreshed = await refreshGoogleToken(refreshToken);
    accessToken = refreshed.access_token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token refresh failed";
    console.warn(`[sync-source ${sourceId}] token refresh failed: ${msg}`);
    await markError(sourceId, "Connection expired. Please reconnect.");
    return failOutcome({
      status: "token_expired",
      error: "Connection expired. Please reconnect.",
      salesSourceId: sourceId,
    });
  }

  // ---------- 4. Read rows ----------
  let rows: string[][];
  try {
    rows = await getSheetRows(accessToken, spreadsheetId, sheetName);
  } catch (err) {
    if (err instanceof GoogleSheetsNotFoundError) {
      await markError(
        sourceId,
        "Spreadsheet not found. It may have been deleted."
      );
      return failOutcome({
        status: "spreadsheet_not_found",
        error: "Spreadsheet not found",
        salesSourceId: sourceId,
      });
    }
    if (err instanceof GoogleSheetsForbiddenError) {
      await markError(
        sourceId,
        "Access denied. Re-share the spreadsheet with the connected Google account."
      );
      return failOutcome({
        status: "forbidden",
        error: "Access denied",
        salesSourceId: sourceId,
      });
    }
    if (err instanceof GoogleSheetsAuthError) {
      await markError(sourceId, "Connection expired. Please reconnect.");
      return failOutcome({
        status: "token_expired",
        error: "Connection expired. Please reconnect.",
        salesSourceId: sourceId,
      });
    }
    const msg = err instanceof Error ? err.message : "Read failed";
    await markError(sourceId, `Sheets read failed: ${msg}`);
    return failOutcome({
      status: "read_failed",
      error: msg,
      salesSourceId: sourceId,
    });
  }

  const totalRows = rows.length;
  const truncated = totalRows > MAX_SYNC_ROWS;
  const workingRows = truncated ? rows.slice(0, MAX_SYNC_ROWS) : rows;

  // ---------- 5. Parse + upsert ----------
  const { valid, errors } = parseSheetRows(workingRows);

  if (totalRows === 0) {
    await markSuccess(sourceId);
    return {
      ok: true,
      status: "ok",
      total_rows: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      truncated: false,
      attribution: null,
      message: "No orders found in spreadsheet.",
      salesSourceId: sourceId,
    };
  }

  if (valid.length === 0 && errors.length > 0) {
    const summary = errors
      .slice(0, 3)
      .map((e) => `row ${e.rowIndex}: ${e.reason}`)
      .join("; ");
    await markError(
      sourceId,
      `All rows failed validation. ${summary}${
        errors.length > 3 ? ` (+${errors.length - 3} more)` : ""
      }`
    );
    return {
      ok: false,
      status: "all_failed",
      total_rows: totalRows,
      inserted: 0,
      updated: 0,
      skipped: errors.length,
      errors: errors.slice(0, 10),
      truncated,
      attribution: null,
      error: "All rows failed validation",
      salesSourceId: sourceId,
    };
  }

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
    console.error(`[sync-source ${sourceId}] upsert failed: ${msg}`);
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
      total_rows: totalRows,
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

  // ---------- 6. Attribution (non-fatal) ----------
  let attribution: MatchResult | null = null;
  try {
    attribution = await matchOrders({ userId: input.userId, projectId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-source ${sourceId}] attribution failed: ${msg}`);
    attribution = null;
  }

  return {
    ok: true,
    status: "ok",
    total_rows: totalRows,
    inserted: upsertResult.inserted,
    updated: upsertResult.updated,
    skipped: errors.length,
    errors: errors.slice(0, 10),
    truncated,
    attribution,
    salesSourceId: sourceId,
    ...(truncated
      ? {
          message: `Synced first ${MAX_SYNC_ROWS} rows of ${totalRows}. Re-run sync to ingest the rest.`,
        }
      : {}),
  };
}

function failOutcome(args: {
  status: SyncSourceStatus;
  error: string;
  salesSourceId?: string;
}): SyncSourceOutcome {
  return {
    ok: false,
    status: args.status,
    total_rows: 0,
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
 * Maps a SyncSourceStatus to the HTTP status code the manual endpoint
 * returns. Kept here so the wrapper stays trivial AND so the cron can
 * use the same mapping for telemetry buckets if it ever wants to.
 */
export function statusToHttpCode(status: SyncSourceStatus): number {
  switch (status) {
    case "ok":
    case "all_failed":
      return 200; // both report `ok` in the body; UI distinguishes via .ok
    case "no_spreadsheet":
      return 400;
    case "source_missing":
      return 404;
    case "spreadsheet_not_found":
      return 404;
    case "forbidden":
      return 403;
    case "token_expired":
      return 401;
    case "db_failed":
    case "read_failed":
      return 500;
  }
}
