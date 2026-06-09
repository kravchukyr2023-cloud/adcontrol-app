import { NextRequest, NextResponse } from "next/server";
import { backfillRevenueAllTables } from "@/server/meta/backfill-revenue";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/backfill-revenue
 *
 * One-shot maintenance endpoint. Walks insight rows whose `revenue` is
 * NULL but `raw_actions` is populated, re-applies the REVENUE_PRIORITY
 * chain from `actions-normalizer.ts`, and writes the resulting value.
 *
 * Auth: shared-secret bearer. Same `CRON_SECRET` env the daily sync
 * cron uses — there's no admin user concept yet, and re-using one
 * secret keeps the surface area small.
 *
 * Operational notes:
 *   - Idempotent. Re-run after a timeout: the WHERE filter drops
 *     already-filled rows.
 *   - Budgeted to finish (or report `truncated`) within Vercel's 60 s
 *     function ceiling. If `truncated: true` comes back, just re-POST
 *     until `total_scanned` stabilises around zero.
 *   - No request body — secret-in-header is the entire input contract.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[backfill-revenue] CRON_SECRET env not set — refusing to run"
    );
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    // Leave ~5 s headroom under the 60 s function ceiling so the
    // response can serialise and return cleanly even if backfill
    // runs to the wire.
    const result = await backfillRevenueAllTables({ maxRuntimeMs: 55_000 });
    const duration_ms = Date.now() - startMs;

    console.log(
      `[backfill-revenue] done scanned=${result.total_scanned} updated=${result.total_updated} truncated=${result.truncated} duration=${duration_ms}ms`
    );

    return NextResponse.json({
      ok: result.ok,
      truncated: result.truncated,
      total_scanned: result.total_scanned,
      total_updated: result.total_updated,
      tables: result.tables,
      duration_ms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const duration_ms = Date.now() - startMs;
    console.error(`[backfill-revenue] FAILED ${msg}`);
    return NextResponse.json(
      { ok: false, error: msg, duration_ms },
      { status: 500 }
    );
  }
}
