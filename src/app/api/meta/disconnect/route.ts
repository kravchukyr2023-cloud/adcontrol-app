import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import {
  getActiveConnection,
  invalidateConnection,
} from "@/server/meta/token-store";
import { cascadeBindingsOnConnectionDisconnect } from "@/server/meta/wire-project";
import { recordConnectionEvent } from "@/server/meta/connection-events";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conn = await getActiveConnection(userId);
  if (!conn) {
    return NextResponse.json({ ok: true, note: "no_active_connection" });
  }

  try {
    await invalidateConnection(userId, conn.id);
    await cascadeBindingsOnConnectionDisconnect({
      userId,
      connectionId: conn.id,
    });

    await recordConnectionEvent({
      userId,
      connectionId: conn.id,
      eventType: "disconnect",
      status: "success",
      message: "User-initiated disconnect",
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
      metadata: { phase: "disconnect" },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
