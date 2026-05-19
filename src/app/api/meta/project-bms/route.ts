import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { getActiveConnection } from "@/server/meta/token-store";
import { getProjectActiveConnection } from "@/server/meta/project-connection";
import { addProjectBm } from "@/server/meta/wire-project";
import { isMissingEnvError } from "@/server/env";
import {
  enforceAddBmLimit,
  isQuotaExceededError,
} from "@/server/billing/enforce-wire-limits";

export const runtime = "nodejs";

/**
 * POST /api/meta/project-bms
 *   body: { project_id, meta_bm_id }
 *   -> adds a Business Manager to a project (creates/reactivates BM membership).
 *   Quota enforced before insert.
 *
 * GET /api/meta/project-bms?project_id=<uuid>
 *   -> returns active BM memberships for the project (used by Data Sources UI).
 */

type PostBody = {
  project_id?: string;
  meta_bm_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/project-bms] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/project-bms] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { project_id, meta_bm_id } = body;
  if (!project_id || !meta_bm_id) {
    return NextResponse.json(
      { error: "project_id and meta_bm_id required" },
      { status: 400 }
    );
  }

  // Verify project ownership.
  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", project_id)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if ((project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Project-aware: if project has any existing bindings, the new BM joins
  // that same connection. Else fall back to user's most recent (first BM
  // for project; multi-FB safe because subsequent BMs follow the first).
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

  // Resolve BM cache row id.
  const adminSupabase = getAdminSupabase();
  const { data: bmRow } = await adminSupabase
    .from("meta_business_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("meta_bm_id", meta_bm_id)
    .maybeSingle();

  if (!bmRow) {
    return NextResponse.json(
      { error: "Cached BM not found. Refresh BM list first." },
      { status: 404 }
    );
  }
  const metaBmRowId = (bmRow as { id: string }).id;

  try {
    await enforceAddBmLimit({ userId, projectId: project_id, metaBmRowId });
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

  const { projectMetaBusinessManagerId } = await addProjectBm({
    userId,
    projectId: project_id,
    metaConnectionId: conn.id,
    metaBmRowId,
  });

  return NextResponse.json({
    ok: true,
    project_meta_business_manager_id: projectMetaBusinessManagerId,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleGet(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/project-bms] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/project-bms] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleGet(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id query param required" },
      { status: 400 }
    );
  }

  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if ((project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getAdminSupabase();
  const { data: memberships, error } = await sb
    .from("project_meta_business_managers")
    .select(
      "id, meta_business_manager_id, status, added_at, meta_business_managers(id, meta_bm_id, bm_name, status)"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("added_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ memberships: memberships ?? [] });
}
