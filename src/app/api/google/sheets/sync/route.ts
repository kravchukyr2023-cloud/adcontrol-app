import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
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
import { matchOrders, type MatchResult } from "@/server/attribution/match-orders";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hobby plan tops out at 60s; the API + parse + upsert path needs headroom,
// so we cap the per-sync row count and surface a "truncated" flag in the
// response. Stage 19 is a manual-trigger sync, so partial coverage is fine.
const MAX_SYNC_ROWS = 1000;

type Body = { project_id?: unknown };

export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const projectId =
      typeof body.project_id === "string" ? body.project_id : null;
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    const sb = await getServerSupabase();
    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projErr) {
      console.error(`[google/sheets/sync] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminSupabase();
    const { data: source, error: srcErr } = await admin
      .from("sales_sources")
      .select("id, source_config, status")
      .eq("project_id", projectId)
      .eq("source_type", "google_sheets")
      .maybeSingle();

    if (srcErr) {
      console.error(`[google/sheets/sync] sales_sources lookup: ${srcErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!source) {
      return NextResponse.json(
        { error: "Google Sheets not connected" },
        { status: 404 }
      );
    }

    const config = (source.source_config as Record<string, unknown>) ?? {};
    const refreshToken =
      typeof config.refresh_token === "string" ? config.refresh_token : null;
    const spreadsheetId =
      typeof config.spreadsheet_id === "string" ? config.spreadsheet_id : null;
    const sheetName =
      typeof config.sheet_name === "string" && config.sheet_name.length > 0
        ? config.sheet_name
        : undefined;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Sheets not connected" },
        { status: 404 }
      );
    }
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "No validated spreadsheet. Pick a spreadsheet first." },
        { status: 400 }
      );
    }

    const sourceId = source.id as string;
    const startedAtIso = new Date().toISOString();

    // Mark the sync attempt — distinguishes "sync started but token refresh
    // failed" from "never tried" in the UI.
    await admin
      .from("sales_sources")
      .update({ last_sync_at: startedAtIso })
      .eq("id", sourceId);

    // --- Token refresh ------------------------------------------------
    let accessToken: string;
    try {
      const refreshed = await refreshGoogleToken(refreshToken);
      accessToken = refreshed.access_token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Token refresh failed";
      console.warn(`[google/sheets/sync] token refresh failed: ${msg}`);
      await markError(sourceId, "Connection expired. Please reconnect.");
      return NextResponse.json(
        { error: "Connection expired. Please reconnect." },
        { status: 401 }
      );
    }

    // --- Read rows ----------------------------------------------------
    let rows: string[][];
    try {
      rows = await getSheetRows(accessToken, spreadsheetId, sheetName);
    } catch (err) {
      if (err instanceof GoogleSheetsNotFoundError) {
        await markError(
          sourceId,
          "Spreadsheet not found. It may have been deleted."
        );
        return NextResponse.json(
          { error: "Spreadsheet not found" },
          { status: 404 }
        );
      }
      if (err instanceof GoogleSheetsForbiddenError) {
        await markError(
          sourceId,
          "Access denied. Re-share the spreadsheet with the connected Google account."
        );
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
      if (err instanceof GoogleSheetsAuthError) {
        await markError(sourceId, "Connection expired. Please reconnect.");
        return NextResponse.json(
          { error: "Connection expired. Please reconnect." },
          { status: 401 }
        );
      }
      const msg = err instanceof Error ? err.message : "Read failed";
      await markError(sourceId, `Sheets read failed: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const totalRows = rows.length;
    let truncated = false;
    let workingRows = rows;
    if (totalRows > MAX_SYNC_ROWS) {
      truncated = true;
      workingRows = rows.slice(0, MAX_SYNC_ROWS);
    }

    // --- Parse + upsert -----------------------------------------------
    const { valid, errors } = parseSheetRows(workingRows);

    // Empty spreadsheet is a happy case, not an error.
    if (totalRows === 0) {
      await markSuccess(sourceId);
      return NextResponse.json({
        ok: true,
        total_rows: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        truncated: false,
        message: "No orders found in spreadsheet.",
      });
    }

    // Every data row failed validation → surface as an error state so the
    // UI prompts the user to fix the template.
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
      return NextResponse.json(
        {
          ok: false,
          total_rows: totalRows,
          inserted: 0,
          updated: 0,
          skipped: errors.length,
          errors: errors.slice(0, 10),
          truncated,
        },
        { status: 200 }
      );
    }

    let upsertResult;
    try {
      upsertResult = await upsertOrders({
        userId,
        projectId,
        salesSourceId: sourceId,
        orders: valid,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upsert failed";
      console.error(`[google/sheets/sync] upsert failed: ${msg}`);
      await markError(sourceId, `Failed to save orders: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Partial DB failures count as warnings but still mark the source healthy
    // if any rows persisted — same model as the Meta sync path.
    if (
      upsertResult.errors.length > 0 &&
      upsertResult.inserted === 0 &&
      upsertResult.updated === 0
    ) {
      await markError(
        sourceId,
        `Failed to save orders: ${upsertResult.errors[0]}`
      );
      return NextResponse.json(
        {
          ok: false,
          total_rows: totalRows,
          inserted: 0,
          updated: 0,
          skipped: errors.length,
          errors: errors.slice(0, 10),
          truncated,
        },
        { status: 500 }
      );
    }

    await markSuccess(sourceId);

    // Attribution runs AFTER orders are persisted. Failure here is non-fatal:
    // the orders are saved, the user just has to re-trigger matching via
    // /api/attribution/rematch (or a future cron).
    let attribution: MatchResult | null = null;
    try {
      attribution = await matchOrders({ userId, projectId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[google/sheets/sync] attribution failed: ${msg}`);
      attribution = null;
    }

    return NextResponse.json({
      ok: true,
      total_rows: totalRows,
      inserted: upsertResult.inserted,
      updated: upsertResult.updated,
      skipped: errors.length,
      errors: errors.slice(0, 10) satisfies RowError[],
      truncated,
      attribution,
      ...(truncated
        ? {
            message: `Synced first ${MAX_SYNC_ROWS} rows of ${totalRows}. Re-run sync to ingest the rest.`,
          }
        : {}),
    });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[google/sheets/sync] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[google/sheets/sync] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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
