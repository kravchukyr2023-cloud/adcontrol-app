import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import {
  getActiveAccessToken,
  markConnectionExpired,
} from "@/server/meta/token-store";
import { getProjectActiveAccessToken } from "@/server/meta/project-connection";
import { fetchBusinessManagers } from "@/server/meta/fetch-business-managers";
import { upsertBusinessManagers } from "@/server/meta/upsert-bms";
import { recordConnectionEvent } from "@/server/meta/connection-events";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

/**
 * POST /api/meta/bms/refresh
 *   body: { project_id?: string }
 *
 * Re-fetches /me/businesses from Meta using the already-stored access token
 * and upserts results into meta_business_managers. Does NOT start a new
 * OAuth flow. Uses project's bound connection when project_id is provided,
 * else user-global most-recent (legacy).
 *
 * - 200 { connected: true,  bms: [...] }  — fresh list (success)
 * - 200 { connected: false, bms: [] }     — no active connection
 * - 200 { connected: false, expired: true, bms: [] }
 *                                          — token expired; frontend shows Reconnect
 * - 500 { connected: true,  bms: [], error } — other Meta API failure
 *
 * Cached BMs that Meta no longer returns are NOT removed (per Phase 1 rule).
 */
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/bms/refresh] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/bms/refresh] ${msg}`);
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

  const active = projectId
    ? await getProjectActiveAccessToken(userId, projectId, {
        allowGlobalFallback: true,
      })
    : await getActiveAccessToken(userId);

  if (!active) {
    return NextResponse.json({ connected: false, bms: [] });
  }

  if (active.expiresAt && active.expiresAt.getTime() < Date.now()) {
    await markConnectionExpired(active.connectionId);
    await recordConnectionEvent({
      userId,
      connectionId: active.connectionId,
      eventType: "token_expired",
      status: "failed",
      message: "Token expired before BM refresh",
    });
    return NextResponse.json({
      connected: false,
      expired: true,
      bms: [],
    });
  }

  try {
    const bms = await fetchBusinessManagers(active.token);

    await upsertBusinessManagers({
      userId,
      connectionId: active.connectionId,
      bms,
    });

    return NextResponse.json({ connected: true, bms });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const tokenInvalid =
      msg.includes("190") || msg.toLowerCase().includes("token");

    if (tokenInvalid) {
      await markConnectionExpired(active.connectionId);
      await recordConnectionEvent({
        userId,
        connectionId: active.connectionId,
        eventType: "token_expired",
        status: "failed",
        message: msg,
        metadata: { phase: "refresh_bms" },
      });
      return NextResponse.json({
        connected: false,
        expired: true,
        bms: [],
        error: msg,
      });
    }

    await recordConnectionEvent({
      userId,
      connectionId: active.connectionId,
      eventType: "error",
      status: "failed",
      message: msg,
      metadata: { phase: "refresh_bms" },
    });
    return NextResponse.json(
      { connected: true, bms: [], error: msg },
      { status: 500 }
    );
  }
}
