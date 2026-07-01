import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { buildMonthlySnapshot } from "@/server/decisions/monthly-snapshot";
import { evaluateSnapshot } from "@/server/decisions/evaluate";
import { explainDecisions } from "@/server/decisions/explain";
import { polishEntities } from "@/server/decisions/polish-entities";
import {
  currentMonthKey,
  saveExplanation,
} from "@/server/decisions/explanation-cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/decisions
 *
 * Daily AI-cache warmer for the Decision Engine. SEPARATE from
 * /api/cron/sync-all — three Meta/Google/Shopify sync passes already eat
 * most of the 60s budget on Hobby; LLM calls (~3-9s each) would push us
 * over the function ceiling, so we run them in their own cron window.
 *
 * For each project with an active Meta selection:
 *   - rebuild snapshot + decisions (cheap),
 *   - call explainDecisions (slow, paid),
 *   - overwrite the row in decision_explanations.
 *
 * Rotation: ORDER BY oldest existing cache first so a single 10-project
 * run drains the staleness fairly. Projects without a cache yet are
 * pulled FIRST (NULLS FIRST equivalent in the JS sort below).
 *
 * Per-project try/catch — one broken project never stops the loop.
 * explainDecisions itself never throws (it returns a fallback explanation
 * when the LLM is unavailable), but a snapshot build can fail on missing
 * data, so we still wrap.
 */

const TOTAL_BUDGET_MS = 55_000;
const SOFT_DEADLINE_MS = 50_000;
const MAX_PROJECTS_PER_RUN = 10;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/decisions] CRON_SECRET env not set — refusing to run");
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
  const admin = getAdminSupabase();
  const month = currentMonthKey();

  // 1. Distinct project_ids that currently have at least one active
  //    project_meta_ad_account binding. These are the projects with
  //    something worth explaining — empty projects don't need an AI
  //    summary.
  const { data: bindingRows, error: bindErr } = await admin
    .from("project_meta_ad_accounts")
    .select("project_id, user_id")
    .eq("status", "active");

  if (bindErr) {
    console.error(`[cron/decisions] bindings lookup: ${bindErr.message}`);
    return NextResponse.json(
      { error: "DB error loading bindings" },
      { status: 500 }
    );
  }

  type Project = { id: string; userId: string };
  const projectsByKey = new Map<string, Project>();
  for (const b of (bindingRows ?? []) as Array<{
    project_id: string;
    user_id: string;
  }>) {
    if (!projectsByKey.has(b.project_id)) {
      projectsByKey.set(b.project_id, {
        id: b.project_id,
        userId: b.user_id,
      });
    }
  }
  const projects = Array.from(projectsByKey.values());

  if (projects.length === 0) {
    console.log(`[cron/decisions] done — no active projects month=${month}`);
    return NextResponse.json({
      total_projects: 0,
      attempted: 0,
      success: 0,
      errors: 0,
      skipped_budget: 0,
      month,
      duration_ms: Date.now() - startMs,
    });
  }

  // 2. Pull existing cache rows for these projects + this month so we can
  //    sort oldest-first. Projects without a row yet sort to the top.
  const projectIds = projects.map((p) => p.id);
  const { data: cacheRows, error: cacheErr } = await admin
    .from("decision_explanations")
    .select("project_id, updated_at")
    .eq("month", month)
    .in("project_id", projectIds);

  if (cacheErr) {
    console.warn(
      `[cron/decisions] cache rotation lookup failed: ${cacheErr.message} — falling back to insertion order`
    );
  }

  const cacheTsByProject = new Map<string, string>();
  for (const r of (cacheRows ?? []) as Array<{
    project_id: string;
    updated_at: string;
  }>) {
    cacheTsByProject.set(r.project_id, r.updated_at);
  }

  // Rotate: projects with no cache (undefined → -Infinity) come first,
  // then oldest cache, then most recently refreshed.
  const sorted = projects.slice().sort((a, b) => {
    const ta = cacheTsByProject.get(a.id);
    const tb = cacheTsByProject.get(b.id);
    if (!ta && !tb) return 0;
    if (!ta) return -1;
    if (!tb) return 1;
    return ta.localeCompare(tb);
  });

  const slice = sorted.slice(0, MAX_PROJECTS_PER_RUN);

  let attempted = 0;
  let success = 0;
  let errors = 0;
  let skippedBudget = sorted.length - slice.length;

  for (const project of slice) {
    if (Date.now() - startMs >= SOFT_DEADLINE_MS) {
      skippedBudget += slice.length - attempted;
      console.log(
        `[cron/decisions] deadline hit after ${attempted} — ${skippedBudget} skipped`
      );
      break;
    }
    if (Date.now() - startMs >= TOTAL_BUDGET_MS) break;

    attempted += 1;
    try {
      const snapshot = await buildMonthlySnapshot({
        userId: project.userId,
        projectId: project.id,
      });
      const decisions = evaluateSnapshot(snapshot);
      let explanation = await explainDecisions({ snapshot, decisions });
      // Stage 4 — drawer entity polish. Only paid for after the base
      // explanation succeeded; polish failure is silent (drawer keeps
      // the deterministic diagnosis).
      let polishCount = 0;
      if (explanation.llmUsed) {
        const polish = await polishEntities({ snapshot, decisions });
        if (polish) {
          explanation = { ...explanation, entityPolish: polish };
          polishCount = Object.keys(polish).length;
        }
      }
      // Cron mirrors the assemble guard: only persist real AI output.
      // If OpenAI is down at the cron window we just skip — tomorrow's
      // run or the next user request will try again. Caching a fallback
      // here would freeze the dry template across the whole next day.
      if (explanation.llmUsed) {
        await saveExplanation({
          userId: project.userId,
          projectId: project.id,
          month,
          explanation,
        });
      }
      success += 1;
      console.log(
        `[cron/decisions] project=${project.id} status=ok llm=${explanation.llmUsed} issues=${decisions.summary.totalIssues} polish=${polishCount}`
      );
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[cron/decisions] project=${project.id} status=exception msg=${msg}`
      );
    }
  }

  const durationMs = Date.now() - startMs;
  console.log(
    `[cron/decisions] done month=${month} attempted=${attempted} success=${success} errors=${errors} skipped_budget=${skippedBudget} duration=${durationMs}ms`
  );

  return NextResponse.json({
    total_projects: projects.length,
    attempted,
    success,
    errors,
    skipped_budget: skippedBudget,
    month,
    duration_ms: durationMs,
  });
}
