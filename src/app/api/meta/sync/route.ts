import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { syncProject, type SyncProjectResult } from "@/server/meta/sync-project";
import { isMissingEnvError } from "@/server/env";
import { debugLog } from "@/server/meta/sync-debug";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/meta/sync
 *
 * Body: { project_id: string }
 *
 * Triggers a manual Meta data sync for every active ad account selected
 * on the given project. Per-AA orchestration runs sequentially; each AA
 * gets its own 25s budget under the orchestrator's runtime cap.
 *
 * A 30s overall wall-clock guard wraps syncProject so we never silently
 * exceed the Vercel function limit — on timeout we return JSON instead
 * of the platform's generic 504 page.
 *
 * Verbose progress logs are gated behind META_SYNC_DEBUG=1. Error logs
 * (Meta API errors, project lookup failures, orchestrator catches,
 * timeout) are always emitted via console.error.
 */

type SyncBody = { project_id?: string };
type TimeoutTag = { __syncTimeout: true };

const SYNC_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest) {
  debugLog("[meta/sync] route hit");
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/sync] env missing: ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[meta/sync] ERROR ${msg}`);
    if (stack) console.error(`[meta/sync] STACK ${stack}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  debugLog(`[meta/sync] userId ${userId ?? "null"}`);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "project_id required" },
      { status: 400 }
    );
  }
  debugLog(`[meta/sync] project_id ${projectId}`);

  const supabase = await getServerSupabase();
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr) {
    console.error(`[meta/sync] project lookup error ${projErr.message}`);
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if ((project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  debugLog("[meta/sync] project ok");

  debugLog("[meta/sync] starting syncProject");
  const startMs = Date.now();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<TimeoutTag>((resolve) => {
    timeoutHandle = setTimeout(() => {
      console.error(
        "[meta/sync] TIMEOUT — syncProject did not finish in 30s"
      );
      resolve({ __syncTimeout: true });
    }, SYNC_TIMEOUT_MS);
  });

  let race: SyncProjectResult | TimeoutTag;
  try {
    race = await Promise.race<SyncProjectResult | TimeoutTag>([
      syncProject({ userId, projectId, isManual: true }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  const elapsed = Date.now() - startMs;

  if ("__syncTimeout" in race) {
    return NextResponse.json(
      {
        ok: false,
        error: "sync_timeout",
        message: "Sync did not finish within 30s",
        elapsed_ms: elapsed,
      },
      { status: 504 }
    );
  }

  const result = race;
  debugLog(
    `[meta/sync] response ok=${result.ok} accounts=${result.totalAccounts} elapsed=${elapsed}ms`
  );
  for (const r of result.results) {
    debugLog(
      `[meta/sync] response AA=${r.metaAdAccountId} acquired=${r.result.acquired} status=${
        r.result.finalStatus ?? "n/a"
      } duration=${r.result.durationMs ?? 0}ms`
    );
  }

  return NextResponse.json({
    ok: result.ok,
    project_id: result.projectId,
    total_accounts: result.totalAccounts,
    results: result.results.map((r) => ({
      meta_ad_account_id: r.metaAdAccountId,
      ad_account_name: r.adAccountName,
      result: r.result,
    })),
    error: result.errorMessage,
    elapsed_ms: elapsed,
  });
}
