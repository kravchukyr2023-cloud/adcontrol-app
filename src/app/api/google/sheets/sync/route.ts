import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import {
  syncGoogleSheetsSource,
  statusToHttpCode,
} from "@/server/sheets/sync-source";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { project_id?: unknown };

/**
 * Thin HTTP wrapper around `syncGoogleSheetsSource`. The endpoint exists
 * for two callers:
 *   - Data Sources "Sync now" button (Stage 19)
 *   - global topbar Sync button   (Stage 20, fire-and-forget after Meta)
 *
 * The cron job (Stage 20) calls `syncGoogleSheetsSource` directly without
 * going through HTTP. This wrapper only handles auth + ownership + the
 * outcome → HTTP-shape translation.
 */
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

    const outcome = await syncGoogleSheetsSource({ userId, projectId });
    const httpCode = statusToHttpCode(outcome.status);

    // Error-style HTTP codes get the `{error: ...}` shape the UI already
    // handles; successful (200) responses carry the full outcome.
    if (httpCode === 200) {
      return NextResponse.json(
        {
          ok: outcome.ok,
          total_rows: outcome.total_rows,
          inserted: outcome.inserted,
          updated: outcome.updated,
          skipped: outcome.skipped,
          errors: outcome.errors,
          truncated: outcome.truncated,
          attribution: outcome.attribution,
          ...(outcome.message ? { message: outcome.message } : {}),
          ...(outcome.error ? { error: outcome.error } : {}),
        },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: outcome.error ?? "Sync failed" },
      { status: httpCode }
    );
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
