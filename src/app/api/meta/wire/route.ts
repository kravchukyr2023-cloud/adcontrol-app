import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { getActiveConnection } from "@/server/meta/token-store";
import { getProjectActiveConnection } from "@/server/meta/project-connection";
import {
  addProjectBm,
  selectProjectAa,
} from "@/server/meta/wire-project";
import { isMissingEnvError } from "@/server/env";
import {
  enforceAddBmLimit,
  enforceAddAaLimit,
  isQuotaExceededError,
} from "@/server/billing/enforce-wire-limits";

export const runtime = "nodejs";

/**
 * COMPAT ADAPTER for legacy 1:1:1 wire flow.
 *
 * Accepts the old { project_id, meta_bm_id, meta_ad_account_id } payload
 * and internally calls the new many-to-many helpers:
 *   1. addProjectBm()        — creates/reactivates BM membership
 *   2. selectProjectAa()     — selects/reactivates AA under that BM
 *
 * Quota enforcement happens at each step.
 *
 * Will be removed after Phase 2 stabilization.
 * New frontend code should use /api/meta/project-bms and /api/meta/project-aas.
 */
type WireBody = {
  project_id?: string;
  meta_bm_id?: string;
  meta_ad_account_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/wire] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/wire] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WireBody;
  try {
    body = (await req.json()) as WireBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, meta_bm_id, meta_ad_account_id } = body;
  if (!project_id || !meta_bm_id || !meta_ad_account_id) {
    return NextResponse.json(
      { error: "project_id, meta_bm_id, meta_ad_account_id required" },
      { status: 400 }
    );
  }

  // Verify project ownership.
  const supabase = await getServerSupabase();
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", project_id)
    .maybeSingle();

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if ((project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Project-aware: use project's bound connection if any; else user's latest.
  const resolution = await getProjectActiveConnection(userId, project_id, {
    allowGlobalFallback: true,
  });
  const conn =
    resolution?.connection ?? (await getActiveConnection(userId));
  if (!conn) {
    return NextResponse.json(
      { error: "No active Meta connection. Connect Meta first." },
      { status: 400 }
    );
  }

  // Resolve cache row IDs.
  const adminSupabase = getAdminSupabase();

  const { data: bmRow } = await adminSupabase
    .from("meta_business_managers")
    .select("id, meta_bm_id")
    .eq("user_id", userId)
    .eq("meta_bm_id", meta_bm_id)
    .maybeSingle();

  const { data: aaRow } = await adminSupabase
    .from("meta_ad_accounts")
    .select("id, meta_ad_account_id")
    .eq("user_id", userId)
    .eq("meta_ad_account_id", meta_ad_account_id)
    .maybeSingle();

  if (!bmRow || !aaRow) {
    return NextResponse.json(
      { error: "Cached BM/Ad Account not found. Refresh lists first." },
      { status: 404 }
    );
  }

  const metaBmRowId = (bmRow as { id: string }).id;
  const metaAaRowId = (aaRow as { id: string }).id;

  // Step 1: add BM membership (quota-checked).
  let projectMetaBusinessManagerId: string;
  try {
    await enforceAddBmLimit({ userId, projectId: project_id, metaBmRowId });
    const r = await addProjectBm({
      userId,
      projectId: project_id,
      metaConnectionId: conn.id,
      metaBmRowId,
    });
    projectMetaBusinessManagerId = r.projectMetaBusinessManagerId;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      return NextResponse.json(
        {
          error: err.code,
          scope: err.scope,
          limit: err.limit,
          used: err.used,
        },
        { status: 402 }
      );
    }
    throw err;
  }

  // Step 2: select AA under that BM membership (quota-checked).
  let projectMetaAdAccountId: string;
  try {
    await enforceAddAaLimit({
      userId,
      projectId: project_id,
      metaAdAccountRowId: metaAaRowId,
    });
    const r = await selectProjectAa({
      userId,
      projectId: project_id,
      projectMetaBusinessManagerId,
      metaAaRowId,
      metaUserId: conn.meta_user_id,
      metaBmId: meta_bm_id,
      metaAdAccountId: meta_ad_account_id,
    });
    projectMetaAdAccountId = r.projectMetaAdAccountId;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      return NextResponse.json(
        {
          error: err.code,
          scope: err.scope,
          limit: err.limit,
          used: err.used,
        },
        { status: 402 }
      );
    }
    throw err;
  }

  return NextResponse.json({
    ok: true,
    // Legacy field name kept for backward compat with existing frontend
    // — populated with the AA-selection id (terminal node of new model).
    binding_id: projectMetaAdAccountId,
    project_meta_business_manager_id: projectMetaBusinessManagerId,
    project_meta_ad_account_id: projectMetaAdAccountId,
  });
}
