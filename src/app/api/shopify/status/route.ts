import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

type StatusResponse = {
  connected: boolean;
  status: "active" | "error" | "disconnected" | "not_connected";
  shop_url: string | null;
  shop_name: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
};

const NOT_CONNECTED: StatusResponse = {
  connected: false,
  status: "not_connected",
  shop_url: null,
  shop_name: null,
  last_sync_at: null,
  last_successful_sync_at: null,
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
      console.error(`[shopify/status] project lookup: ${projErr.message}`);
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
      .eq("source_type", "shopify")
      .maybeSingle();

    if (srcErr) {
      console.error(`[shopify/status] sales_sources lookup: ${srcErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    if (!source) {
      return NextResponse.json(NOT_CONNECTED satisfies StatusResponse);
    }

    // NEVER include access_token here — it's stored in source_config but must
    // not leak to the client.
    const config = (source.source_config as Record<string, unknown>) ?? {};
    const dbStatus = (source.status as string) ?? "disconnected";

    let uiStatus: StatusResponse["status"];
    if (dbStatus === "active") uiStatus = "active";
    else if (dbStatus === "error") uiStatus = "error";
    else uiStatus = "disconnected";

    const resp: StatusResponse = {
      connected: dbStatus !== "disconnected",
      status: uiStatus,
      shop_url:
        typeof config.shop_url === "string" ? config.shop_url : null,
      shop_name:
        typeof config.shop_name === "string" ? config.shop_name : null,
      last_sync_at: (source.last_sync_at as string | null) ?? null,
      last_successful_sync_at:
        (source.last_successful_sync_at as string | null) ?? null,
      last_error: (source.last_error as string | null) ?? null,
    };

    return NextResponse.json(resp);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[shopify/status] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[shopify/status] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
