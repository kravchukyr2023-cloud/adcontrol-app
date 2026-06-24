import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { buildMonthlySnapshot } from "@/server/decisions/monthly-snapshot";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/decisions/snapshot?project_id=<uuid>
 *
 * Temporary endpoint for Stage 29 — returns the raw MonthlySnapshot so the
 * pipeline (and the explore/AI work in Stages 30-31) can be exercised before
 * the cache + cron (Stage 32) and the production /api/decisions endpoint
 * (Stage 33) exist. Plain JSON, no caching, no Decision Engine logic on top
 * yet. Will be folded into /api/decisions in Stage 32.
 */
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
      console.error(`[decisions/snapshot] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshot = await buildMonthlySnapshot({ userId, projectId });
    return NextResponse.json(snapshot);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[decisions/snapshot] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[decisions/snapshot] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
