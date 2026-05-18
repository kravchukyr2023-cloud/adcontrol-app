import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import {
  getActiveAccessToken,
  markConnectionExpired,
} from "@/server/meta/token-store";
import { fetchBusinessManagers } from "@/server/meta/fetch-business-managers";
import { upsertBusinessManagers } from "@/server/meta/upsert-bms";
import { recordConnectionEvent } from "@/server/meta/connection-events";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await getActiveAccessToken(userId);
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
