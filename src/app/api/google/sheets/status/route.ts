import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

type StatusResponse = {
  connected: boolean;
  status: "active" | "error" | "disconnected" | "not_connected";
  google_email: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

const NOT_CONNECTED: StatusResponse = {
  connected: false,
  status: "not_connected",
  google_email: null,
  spreadsheet_id: null,
  spreadsheet_name: null,
  last_sync_at: null,
  last_error: null,
};

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
      console.error(`[google/sheets/status] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminSupabase();
    const { data: source, error: srcErr } = await admin
      .from("sales_sources")
      .select(
        "source_config, status, last_successful_sync_at, last_sync_at, last_error"
      )
      .eq("project_id", projectId)
      .eq("source_type", "google_sheets")
      .maybeSingle();

    if (srcErr) {
      console.error(`[google/sheets/status] sales_sources lookup: ${srcErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    if (!source) {
      return NextResponse.json(NOT_CONNECTED satisfies StatusResponse);
    }

    const config = (source.source_config as Record<string, unknown>) ?? {};
    const dbStatus = (source.status as string) ?? "disconnected";

    // Map sales_sources.status enum → UI-facing status.
    let uiStatus: StatusResponse["status"];
    if (dbStatus === "active") uiStatus = "active";
    else if (dbStatus === "error") uiStatus = "error";
    else uiStatus = "disconnected";

    const resp: StatusResponse = {
      connected: dbStatus !== "disconnected",
      status: uiStatus,
      google_email:
        typeof config.google_email === "string" ? config.google_email : null,
      spreadsheet_id:
        typeof config.spreadsheet_id === "string"
          ? config.spreadsheet_id
          : null,
      spreadsheet_name:
        typeof config.spreadsheet_name === "string"
          ? config.spreadsheet_name
          : null,
      last_sync_at:
        (source.last_successful_sync_at as string | null) ??
        (source.last_sync_at as string | null) ??
        null,
      last_error: (source.last_error as string | null) ?? null,
    };

    return NextResponse.json(resp);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[google/sheets/status] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[google/sheets/status] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
