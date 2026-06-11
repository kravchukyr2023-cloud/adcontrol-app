import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { refreshGoogleToken } from "@/lib/google/oauth";
import {
  getSheetHeaders,
  getSheetRows,
  GoogleSheetsAuthError,
  GoogleSheetsForbiddenError,
  GoogleSheetsNotFoundError,
} from "@/lib/google/sheets";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

// Order matters — validation compares column-by-column by index against the
// user's header row. Update this list if the template changes.
const EXPECTED_COLUMNS = [
  "date",
  "order_id",
  "customer_name",
  "customer_email",
  "product",
  "revenue",
  "currency",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type SelectBody = {
  project_id?: unknown;
  spreadsheet_id?: unknown;
  spreadsheet_name?: unknown;
  sheet_name?: unknown;
};

/**
 * Best-effort lookup of a spreadsheet's title via the Drive metadata API.
 * Used only when the client didn't pass spreadsheet_name (older callers, or
 * direct API use). Non-fatal — any failure returns null so the caller can
 * still persist a successful validation with spreadsheet_name=null.
 */
async function fetchSpreadsheetName(
  accessToken: string,
  spreadsheetId: string
): Promise<string | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      spreadsheetId
    )}?fields=name`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { name?: string };
    return typeof data.name === "string" && data.name.length > 0
      ? data.name
      : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: SelectBody;
    try {
      body = (await req.json()) as SelectBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const projectId =
      typeof body.project_id === "string" ? body.project_id : null;
    const spreadsheetId =
      typeof body.spreadsheet_id === "string" ? body.spreadsheet_id : null;
    const spreadsheetNameInput =
      typeof body.spreadsheet_name === "string" &&
      body.spreadsheet_name.trim().length > 0
        ? body.spreadsheet_name.trim()
        : null;
    const sheetName =
      typeof body.sheet_name === "string" && body.sheet_name.length > 0
        ? body.sheet_name
        : undefined;

    if (!projectId || !spreadsheetId) {
      return NextResponse.json(
        { error: "Missing project_id or spreadsheet_id" },
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
      console.error(`[google/sheets/select] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminSupabase();
    const { data: source, error: srcErr } = await admin
      .from("sales_sources")
      .select("id, source_config")
      .eq("project_id", projectId)
      .eq("source_type", "google_sheets")
      .maybeSingle();

    if (srcErr) {
      console.error(`[google/sheets/select] sales_sources lookup: ${srcErr.message}`);
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
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Sheets not connected" },
        { status: 404 }
      );
    }

    let accessToken: string;
    try {
      const refreshed = await refreshGoogleToken(refreshToken);
      accessToken = refreshed.access_token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Token refresh failed";
      console.warn(`[google/sheets/select] token refresh failed: ${msg}`);
      await admin
        .from("sales_sources")
        .update({
          status: "error",
          last_error: "Token expired. Please reconnect.",
          last_error_at: new Date().toISOString(),
        })
        .eq("id", source.id);
      return NextResponse.json(
        { error: "Token expired. Please reconnect." },
        { status: 401 }
      );
    }

    let headers: string[];
    let rows: string[][];
    try {
      headers = await getSheetHeaders(accessToken, spreadsheetId, sheetName);
      rows = await getSheetRows(accessToken, spreadsheetId, sheetName);
    } catch (err) {
      if (err instanceof GoogleSheetsNotFoundError) {
        await admin
          .from("sales_sources")
          .update({
            status: "error",
            last_error: "Spreadsheet not found. It may have been deleted.",
            last_error_at: new Date().toISOString(),
          })
          .eq("id", source.id);
        return NextResponse.json(
          { error: "Spreadsheet not found" },
          { status: 404 }
        );
      }
      if (err instanceof GoogleSheetsForbiddenError) {
        return NextResponse.json(
          { error: "Access denied. Ensure the spreadsheet is shared with the connected Google account." },
          { status: 403 }
        );
      }
      if (err instanceof GoogleSheetsAuthError) {
        return NextResponse.json(
          { error: "Token expired. Please reconnect." },
          { status: 401 }
        );
      }
      throw err;
    }

    if (headers.length < EXPECTED_COLUMNS.length) {
      return NextResponse.json(
        {
          error: `Expected ${EXPECTED_COLUMNS.length} columns, found ${headers.length}. Please copy the template and keep all columns.`,
          expected: EXPECTED_COLUMNS,
          found: headers,
        },
        { status: 400 }
      );
    }

    for (let i = 0; i < EXPECTED_COLUMNS.length; i++) {
      const expected = EXPECTED_COLUMNS[i];
      const actual = (headers[i] ?? "").trim().toLowerCase();
      if (actual !== expected) {
        return NextResponse.json(
          {
            error: `Column #${i + 1} expected '${expected}' but found '${headers[i] ?? ""}'. Please copy the template and use exact column names.`,
            column_index: i,
            expected,
            found: headers[i] ?? "",
          },
          { status: 400 }
        );
      }
    }

    // Resolve the spreadsheet's display name: prefer the value the client
    // already has from /list (cheap), fall back to Drive metadata (one extra
    // request, only on cold paths or direct API callers).
    const spreadsheetName =
      spreadsheetNameInput ??
      (await fetchSpreadsheetName(accessToken, spreadsheetId));

    const mergedConfig = {
      ...config,
      spreadsheet_id: spreadsheetId,
      spreadsheet_name: spreadsheetName,
      sheet_name: sheetName ?? null,
      validated_at: new Date().toISOString(),
    };

    const { error: updErr } = await admin
      .from("sales_sources")
      .update({
        source_config: mergedConfig,
        status: "active",
        last_error: null,
        last_error_at: null,
      })
      .eq("id", source.id);

    if (updErr) {
      console.error(`[google/sheets/select] update sales_sources: ${updErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      columns: EXPECTED_COLUMNS,
      row_count: rows.length,
    });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[google/sheets/select] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[google/sheets/select] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
