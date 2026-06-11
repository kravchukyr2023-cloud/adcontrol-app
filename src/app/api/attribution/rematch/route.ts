import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { matchOrders } from "@/server/attribution/match-orders";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { project_id?: unknown };

/**
 * Manual re-trigger for the attribution matcher.
 *
 * Used when the user adds/renames Meta entities AFTER syncing orders —
 * existing 'unmatched'/'partial' orders can be re-evaluated without
 * touching Google Sheets again. The sync route already runs matching
 * inline, so most users won't need this — it's a recovery path.
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
      console.error(`[attribution/rematch] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await matchOrders({ userId, projectId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[attribution/rematch] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[attribution/rematch] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
