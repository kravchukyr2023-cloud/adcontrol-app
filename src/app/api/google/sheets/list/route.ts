import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { refreshGoogleToken } from "@/lib/google/oauth";
import { listUserSpreadsheets } from "@/lib/google/sheets";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = req.nextUrl.searchParams.get("project_id");
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
      console.error(`[google/sheets/list] project lookup: ${projErr.message}`);
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
      console.error(`[google/sheets/list] sales_sources lookup: ${srcErr.message}`);
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
      console.warn(`[google/sheets/list] token refresh failed: ${msg}`);
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

    const files = await listUserSpreadsheets(accessToken);
    return NextResponse.json({ spreadsheets: files });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[google/sheets/list] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[google/sheets/list] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
