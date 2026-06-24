import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { buildMonthlySnapshot } from "@/server/decisions/monthly-snapshot";
import { evaluateSnapshot } from "@/server/decisions/evaluate";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/decisions/snapshot?project_id=<uuid>
 *
 * Temporary endpoint for Stages 29-30 — returns:
 *   - snapshot: the raw MonthlySnapshot (Stage 29)
 *   - decisions: the deterministic rules-engine output (Stage 30)
 *
 * Plain JSON, no caching, no AI layer yet (that's Stage 31). Will be folded
 * into the production /api/decisions in Stage 32 / 33.
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
    const decisions = evaluateSnapshot(snapshot);
    return NextResponse.json({ snapshot, decisions });
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
