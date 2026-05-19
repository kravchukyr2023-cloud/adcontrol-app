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
 * GET /api/meta/bms
 *   - ?project_id=<uuid>  → uses project's bound connection (multi-FB safe);
 *                            falls back to user-global if project has no
 *                            bindings yet.
 *   - no project_id       → user-global (legacy / first-time Connect prompt).
 */
export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/bms] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/bms] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("project_id");

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
      message: "Token expired before BM fetch",
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
        metadata: { phase: "fetch_bms" },
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
      metadata: { phase: "fetch_bms" },
    });
    return NextResponse.json(
      { connected: true, bms: [], error: msg },
      { status: 500 }
    );
  }
}
