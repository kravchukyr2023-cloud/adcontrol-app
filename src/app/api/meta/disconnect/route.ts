import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import {
  getActiveConnection,
  invalidateConnection,
} from "@/server/meta/token-store";
import {
  getProjectActiveConnection,
  isConnectionUsedByOtherProjects,
} from "@/server/meta/project-connection";
import { recordConnectionEvent } from "@/server/meta/connection-events";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

/**
 * POST /api/meta/disconnect
 *   body: { project_id?: string }
 *
 * - With project_id (recommended): disconnect THIS project from Meta.
 *   Soft-deactivates all project_meta_business_managers + project_meta_ad_accounts
 *   rows for the project. If the connection bound to those rows is NOT used
 *   by any OTHER project, also revokes the token (full disconnect).
 *
 * - Without project_id (legacy): disconnect the user's most-recently-active
 *   connection globally, cascading ALL its bindings across all projects.
 *   Retained for backward compat.
 */
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/disconnect] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/disconnect] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let projectId: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      project_id?: string;
    };
    projectId = body.project_id ?? null;
  } catch {
    projectId = null;
  }

  // Project-scoped path.
  if (projectId) {
    return handleProjectDisconnect(userId, projectId);
  }

  // Legacy user-global path.
  return handleGlobalDisconnect(userId);
}

async function handleProjectDisconnect(userId: string, projectId: string) {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  // Resolve which connection this project uses (no global fallback — if
  // project has no bindings, nothing to disconnect).
  const resolution = await getProjectActiveConnection(userId, projectId, {
    allowGlobalFallback: false,
  });

  if (!resolution) {
    // Project has no Meta wiring — nothing to do.
    return NextResponse.json({
      ok: true,
      note: "no_project_meta_wiring",
    });
  }

  const connectionId = resolution.connection.id;

  try {
    // 1. Soft-deactivate all active AA selections for this project.
    await sb
      .from("project_meta_ad_accounts")
      .update({
        status: "inactive",
        deselected_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("status", "active");

    // 2. Soft-deactivate all active BM memberships for this project.
    await sb
      .from("project_meta_business_managers")
      .update({
        status: "inactive",
        removed_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("status", "active");

    // 3. If no OTHER project uses this connection, revoke the token globally.
    //    Else keep the connection alive (other projects depend on it).
    const stillUsed = await isConnectionUsedByOtherProjects({
      userId,
      connectionId,
      excludeProjectId: projectId,
    });

    if (!stillUsed) {
      await invalidateConnection(userId, connectionId);
    }

    await recordConnectionEvent({
      userId,
      connectionId,
      eventType: "disconnect",
      status: "success",
      message: stillUsed
        ? `Project ${projectId} unbound from connection (still used by other projects).`
        : `Project ${projectId} unbound and connection token revoked (no other consumers).`,
      metadata: {
        project_id: projectId,
        token_revoked: !stillUsed,
      },
    });

    return NextResponse.json({
      ok: true,
      project_id: projectId,
      token_revoked: !stillUsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordConnectionEvent({
      userId,
      connectionId,
      eventType: "error",
      status: "failed",
      message: msg,
      metadata: { phase: "project_disconnect", project_id: projectId },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleGlobalDisconnect(userId: string) {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  const conn = await getActiveConnection(userId);
  if (!conn) {
    return NextResponse.json({ ok: true, note: "no_active_connection" });
  }

  try {
    // Cascade: deactivate all bindings tied to this connection across ALL projects.
    const { data: bmRows } = await sb
      .from("project_meta_business_managers")
      .select("id")
      .eq("user_id", userId)
      .eq("meta_connection_id", conn.id)
      .eq("status", "active");

    const bmIds = ((bmRows ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (bmIds.length > 0) {
      await sb
        .from("project_meta_ad_accounts")
        .update({ status: "disconnected", deselected_at: now, updated_at: now })
        .in("project_meta_business_manager_id", bmIds)
        .eq("status", "active");

      await sb
        .from("project_meta_business_managers")
        .update({ status: "disconnected", removed_at: now, updated_at: now })
        .in("id", bmIds);
    }

    await invalidateConnection(userId, conn.id);

    await recordConnectionEvent({
      userId,
      connectionId: conn.id,
      eventType: "disconnect",
      status: "success",
      message: "User-initiated global disconnect",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordConnectionEvent({
      userId,
      connectionId: conn.id,
      eventType: "error",
      status: "failed",
      message: msg,
      metadata: { phase: "global_disconnect" },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
