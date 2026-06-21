import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { syncProject } from "@/server/meta/sync-project";
import { syncGoogleSheetsSource } from "@/server/sheets/sync-source";
import { syncShopifySource } from "@/server/shopify/sync-source";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hobby plan budgets — 60s function ceiling, three sequential passes
 * (Meta → Google → Shopify). Soft deadlines are SKIP-IF-PAST checkpoints
 * on the shared wall clock, NOT per-pass time slices. Tuning intent:
 *
 *   - Meta is unbounded (always runs first); a slow Meta can eat the
 *     budget and we skip the rest — better than half-syncing some users.
 *   - Google is allowed to run until 45s have elapsed, then exits.
 *     Tightened from 50s in Stage 20 to leave headroom for Shopify.
 *   - Shopify runs until 53s, draining whatever budget is left after
 *     Google. May be near zero on a Meta-heavy day, which is fine —
 *     tomorrow's cron picks up the orphaned shops.
 *
 * Per-pass MAX_*_SOURCES_PER_RUN caps the number of rows we even consider
 * so a backlog of error'd sources can't monopolize a healthy day.
 */
const TOTAL_BUDGET_MS = 55_000;
const GOOGLE_SOFT_DEADLINE_MS = 45_000;
const MAX_GOOGLE_SOURCES_PER_RUN = 20;
const SHOPIFY_SOFT_DEADLINE_MS = 53_000;
const MAX_SHOPIFY_SOURCES_PER_RUN = 20;

/**
 * GET /api/cron/sync-all
 *
 * Vercel Cron entry point. Three passes:
 *   1. Meta sync — iterates every user with an active Meta connection
 *      and runs syncProject() for each of their projects.
 *   2. Google Sheets sync — iterates every `sales_sources` row with
 *      source_type='google_sheets', status='active', and a configured
 *      spreadsheet_id, and runs syncGoogleSheetsSource() per row.
 *   3. Shopify sync — iterates every `sales_sources` row with
 *      source_type='shopify', status='active', and runs
 *      syncShopifySource() per row. Runs after Meta + Google so the
 *      Stage 21 attribution matcher sees the freshly-synced Meta
 *      entities.
 *
 * Auth: shared-secret bearer in the Authorization header. The check
 * runs FIRST — before any SQL — so an unauthenticated probe never
 * reaches the database.
 *
 * Failure isolation: per-user / per-project / per-source try/catch.
 * One broken connection must not stop the rest of the run.
 *
 * Response shape is intentionally aggregate-only: counts + duration.
 * No tokens, secrets, or per-source payloads are returned — the response
 * may be visible in Vercel's cron-run UI / logs.
 *
 * Hobby-tier note: vercel.json schedules this daily at 06:00 UTC
 * (Hobby is capped at 1 cron/day). The Google loop is capped at
 * `MAX_GOOGLE_SOURCES_PER_RUN` sources and soft-deadlines at
 * `GOOGLE_SOFT_DEADLINE_MS` so the function can return cleanly even
 * on a slow Meta run.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET env not set — refusing to run");
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
  const sb = getAdminSupabase();

  const { data: connRows, error: connErr } = await sb
    .from("meta_connections")
    .select("user_id")
    .eq("status", "active");

  if (connErr) {
    console.error(`[cron] connection lookup failed: ${connErr.message}`);
    return NextResponse.json(
      { error: "DB error loading connections" },
      { status: 500 }
    );
  }

  const userIds = Array.from(
    new Set(
      ((connRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
    )
  );

  let totalProjects = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const userId of userIds) {
    try {
      const { data: projRows, error: projErr } = await sb
        .from("projects")
        .select("id")
        .eq("user_id", userId);

      if (projErr) {
        console.error(
          `[cron] user ${userId} project lookup failed: ${projErr.message}`
        );
        continue;
      }

      const projects = (projRows ?? []) as Array<{ id: string }>;
      if (projects.length === 0) {
        console.log(`[cron] user ${userId} has 0 projects — skipping`);
        continue;
      }

      for (const proj of projects) {
        totalProjects++;
        try {
          const result = await syncProject({
            userId,
            projectId: proj.id,
            isManual: false,
          });

          // Classify outcome. token_expired is signalled by syncProject as
          // result.ok === false plus per-AA acquired:false with lockReason
          // "token_expired" — we don't need to re-derive it here, just log
          // the project-level status string and move on.
          let status: string;
          if (result.ok) {
            status = "ok";
            successCount++;
          } else if (
            result.results.some(
              (r) =>
                r.result.acquired === false &&
                r.result.lockReason === "token_expired"
            )
          ) {
            status = "token_expired";
            failedCount++;
          } else if (result.errorMessage) {
            status = "error";
            failedCount++;
          } else {
            status = "partial";
            failedCount++;
          }

          console.log(
            `[cron] user ${userId} project ${proj.id} sync status=${status} accounts=${result.totalAccounts}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[cron] user ${userId} project ${proj.id} sync status=exception msg=${msg}`
          );
          failedCount++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] user ${userId} skipped — unexpected error: ${msg}`);
    }
  }

  // -----------------------------------------------------------------
  // Pass 2: Google Sheets sync.
  // Runs after Meta so the Stage 21 attribution matcher (kicked off
  // inside syncGoogleSheetsSource) sees the freshly-synced Meta
  // entities. Soft-deadlines on the wall clock — never blocks the
  // function from returning.
  // -----------------------------------------------------------------
  let googleAttempted = 0;
  let googleSuccess = 0;
  let googleErrors = 0;
  let googleSkippedBudget = 0;
  let googleSkippedNoSheet = 0;

  if (Date.now() - startMs >= GOOGLE_SOFT_DEADLINE_MS) {
    console.log(
      `[cron] google loop skipped — Meta consumed ${Date.now() - startMs}ms (budget ${GOOGLE_SOFT_DEADLINE_MS}ms)`
    );
  } else {
    const { data: sourceRows, error: sourceErr } = await sb
      .from("sales_sources")
      .select("id, user_id, source_config")
      .eq("source_type", "google_sheets")
      .eq("status", "active")
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(MAX_GOOGLE_SOURCES_PER_RUN);

    if (sourceErr) {
      console.error(
        `[cron] google sales_sources lookup failed: ${sourceErr.message}`
      );
    } else {
      const sources = (sourceRows ?? []) as Array<{
        id: string;
        user_id: string;
        source_config: Record<string, unknown> | null;
      }>;

      for (const src of sources) {
        if (Date.now() - startMs >= GOOGLE_SOFT_DEADLINE_MS) {
          googleSkippedBudget += sources.length - googleAttempted;
          console.log(
            `[cron] google loop deadline hit after ${googleAttempted} sources — ${googleSkippedBudget} skipped`
          );
          break;
        }
        if (Date.now() - startMs >= TOTAL_BUDGET_MS) break;

        const spreadsheetId =
          typeof src.source_config?.spreadsheet_id === "string"
            ? src.source_config.spreadsheet_id
            : null;
        if (!spreadsheetId) {
          // Connected but the user never picked a sheet — not an error,
          // just nothing to sync yet.
          googleSkippedNoSheet++;
          continue;
        }

        googleAttempted++;
        try {
          const outcome = await syncGoogleSheetsSource({
            userId: src.user_id,
            salesSourceId: src.id,
          });
          if (outcome.ok) {
            googleSuccess++;
            console.log(
              `[cron] google source=${src.id} status=ok rows=${outcome.total_rows} inserted=${outcome.inserted} updated=${outcome.updated} skipped=${outcome.skipped}`
            );
          } else {
            googleErrors++;
            console.log(
              `[cron] google source=${src.id} status=${outcome.status} error=${outcome.error ?? "—"}`
            );
          }
        } catch (err) {
          googleErrors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[cron] google source=${src.id} status=exception msg=${msg}`
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // Pass 3: Shopify sync.
  // Runs last — by now Meta entities are fresh, so the attribution
  // matcher inside syncShopifySource sees them. Shares the same
  // soft-deadline pattern as Google; if Meta+Google ate the budget,
  // we skip and rely on tomorrow's cron.
  // -----------------------------------------------------------------
  let shopifyAttempted = 0;
  let shopifySuccess = 0;
  let shopifyErrors = 0;
  let shopifySkippedBudget = 0;

  if (Date.now() - startMs >= SHOPIFY_SOFT_DEADLINE_MS) {
    console.log(
      `[cron] shopify loop skipped — earlier passes consumed ${Date.now() - startMs}ms (budget ${SHOPIFY_SOFT_DEADLINE_MS}ms)`
    );
  } else {
    const { data: shopifyRows, error: shopifyErr } = await sb
      .from("sales_sources")
      .select("id, user_id")
      .eq("source_type", "shopify")
      .eq("status", "active")
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(MAX_SHOPIFY_SOURCES_PER_RUN);

    if (shopifyErr) {
      console.error(
        `[cron] shopify sales_sources lookup failed: ${shopifyErr.message}`
      );
    } else {
      const sources = (shopifyRows ?? []) as Array<{
        id: string;
        user_id: string;
      }>;

      for (const src of sources) {
        if (Date.now() - startMs >= SHOPIFY_SOFT_DEADLINE_MS) {
          shopifySkippedBudget += sources.length - shopifyAttempted;
          console.log(
            `[cron] shopify loop deadline hit after ${shopifyAttempted} sources — ${shopifySkippedBudget} skipped`
          );
          break;
        }
        if (Date.now() - startMs >= TOTAL_BUDGET_MS) break;

        shopifyAttempted++;
        try {
          const outcome = await syncShopifySource({
            userId: src.user_id,
            salesSourceId: src.id,
          });
          if (outcome.ok) {
            shopifySuccess++;
            console.log(
              `[cron] shopify source=${src.id} status=ok orders=${outcome.total_orders} inserted=${outcome.inserted} updated=${outcome.updated} skipped=${outcome.skipped}`
            );
          } else {
            shopifyErrors++;
            console.log(
              `[cron] shopify source=${src.id} status=${outcome.status} error=${outcome.error ?? "—"}`
            );
          }
        } catch (err) {
          shopifyErrors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[cron] shopify source=${src.id} status=exception msg=${msg}`
          );
        }
      }
    }
  }

  const durationMs = Date.now() - startMs;
  console.log(
    `[cron] done users=${userIds.length} projects=${totalProjects} meta_success=${successCount} meta_failed=${failedCount} google_attempted=${googleAttempted} google_success=${googleSuccess} google_errors=${googleErrors} google_skipped_budget=${googleSkippedBudget} google_skipped_nosheet=${googleSkippedNoSheet} shopify_attempted=${shopifyAttempted} shopify_success=${shopifySuccess} shopify_errors=${shopifyErrors} shopify_skipped_budget=${shopifySkippedBudget} duration=${durationMs}ms`
  );

  return NextResponse.json({
    total_users: userIds.length,
    total_projects: totalProjects,
    success_count: successCount,
    failed_count: failedCount,
    google: {
      attempted: googleAttempted,
      success: googleSuccess,
      errors: googleErrors,
      skipped_budget: googleSkippedBudget,
      skipped_no_sheet: googleSkippedNoSheet,
    },
    shopify: {
      attempted: shopifyAttempted,
      success: shopifySuccess,
      errors: shopifyErrors,
      skipped_budget: shopifySkippedBudget,
    },
    duration_ms: durationMs,
  });
}
