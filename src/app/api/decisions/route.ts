import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { assembleDecisions } from "@/server/decisions/assemble";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/decisions?project_id=<uuid>[&refresh=true]
 *
 * Canonical Decision Engine endpoint.
 *
 *   - snapshot + decisions are recomputed live on every call.
 *   - explanation is read from cache (decision_explanations); generated
 *     live on first hit per (project, month).
 *   - ?refresh=true forces a fresh LLM call + cache overwrite (this is
 *     what the "Оновити" button calls).
 *
 * Response shape:
 *   {
 *     snapshot, decisions, explanation,
 *     meta: { explanationFromCache, explanationComputedAt, month }
 *   }
 *
 * The cron at /api/cron/decisions warms this cache once a day; manual
 * refresh stays responsive (single LLM call ≈ 3-9s under the 30s ceiling).
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
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    const sb = await getServerSupabase();
    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projErr) {
      console.error(`[decisions] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await assembleDecisions({ userId, projectId, refresh });
    return NextResponse.json(result);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[decisions] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[decisions] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
