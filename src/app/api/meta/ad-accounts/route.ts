import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import {
  getActiveAccessToken,
  markConnectionExpired,
} from "@/server/meta/token-store";
import { fetchOwnedAdAccounts } from "@/server/meta/fetch-owned-ad-accounts";
import { upsertAdAccounts } from "@/server/meta/upsert-ad-accounts";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { recordConnectionEvent } from "@/server/meta/connection-events";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metaBmId = req.nextUrl.searchParams.get("bmId");
  if (!metaBmId) {
    return NextResponse.json(
      { error: "bmId query param required" },
      { status: 400 }
    );
  }

  const active = await getActiveAccessToken(userId);
  if (!active) {
    return NextResponse.json({ connected: false, accounts: [] });
  }

  if (active.expiresAt && active.expiresAt.getTime() < Date.now()) {
    await markConnectionExpired(active.connectionId);
    await recordConnectionEvent({
      userId,
      connectionId: active.connectionId,
      eventType: "token_expired",
      status: "failed",
      message: "Token expired before Ad Account fetch",
    });
    return NextResponse.json({
      connected: false,
      expired: true,
      accounts: [],
    });
  }

  const adminSupabase = getAdminSupabase();
  const { data: bmRow } = await adminSupabase
    .from("meta_business_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("meta_bm_id", metaBmId)
    .maybeSingle();

  if (!bmRow) {
    return NextResponse.json(
      { error: "Unknown Business Manager. Refresh BM list first." },
      { status: 404 }
    );
  }

  try {
    const accounts = await fetchOwnedAdAccounts(metaBmId, active.token);

    await upsertAdAccounts({
      userId,
      metaBusinessManagerRowId: (bmRow as { id: string }).id,
      accounts,
    });

    return NextResponse.json({ connected: true, accounts });
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
        metadata: { phase: "fetch_ad_accounts", bm: metaBmId },
      });
      return NextResponse.json({
        connected: false,
        expired: true,
        accounts: [],
        error: msg,
      });
    }

    await recordConnectionEvent({
      userId,
      connectionId: active.connectionId,
      eventType: "error",
      status: "failed",
      message: msg,
      metadata: { phase: "fetch_ad_accounts", bm: metaBmId },
    });
    return NextResponse.json(
      { connected: true, accounts: [], error: msg },
      { status: 500 }
    );
  }
}
