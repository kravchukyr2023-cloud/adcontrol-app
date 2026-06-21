import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import {
  syncShopifySource,
  shopifyStatusToHttpCode,
} from "@/server/shopify/sync-source";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { project_id?: unknown };

/**
 * Thin HTTP wrapper around `syncShopifySource`. Mirrors the Google Sheets
 * sync route — auth + ownership + outcome → HTTP-shape translation, nothing
 * else. The cron (Stage 26 part 2) calls `syncShopifySource` directly.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const projectId =
      typeof body.project_id === "string" ? body.project_id : null;
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    const sb = await getServerSupabase();
    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projErr) {
      console.error(`[shopify/sync] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const outcome = await syncShopifySource({ userId, projectId });
    const httpCode = shopifyStatusToHttpCode(outcome.status);

    if (httpCode === 200) {
      return NextResponse.json(
        {
          ok: outcome.ok,
          total_orders: outcome.total_orders,
          inserted: outcome.inserted,
          updated: outcome.updated,
          skipped: outcome.skipped,
          errors: outcome.errors,
          truncated: outcome.truncated,
          attribution: outcome.attribution,
          ...(outcome.message ? { message: outcome.message } : {}),
          ...(outcome.error ? { error: outcome.error } : {}),
        },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: outcome.error ?? "Sync failed" },
      { status: httpCode }
    );
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[shopify/sync] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[shopify/sync] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
