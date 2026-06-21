import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";
import {
  normalizeShopUrl,
  validateShopifyConnection,
  ShopifyAuthError,
  ShopifyNotFoundError,
  ShopifyError,
} from "@/lib/shopify/client";

export const runtime = "nodejs";

type Body = {
  project_id?: unknown;
  shop_url?: unknown;
  access_token?: unknown;
};

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
    const shopUrlRaw =
      typeof body.shop_url === "string" ? body.shop_url : null;
    const accessToken =
      typeof body.access_token === "string" ? body.access_token.trim() : null;

    if (!projectId || !shopUrlRaw || !accessToken) {
      return NextResponse.json(
        { error: "Missing project_id, shop_url, or access_token" },
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
      console.error(`[shopify/connect] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let shopUrl: string;
    try {
      shopUrl = normalizeShopUrl(shopUrlRaw);
    } catch {
      return NextResponse.json(
        { error: "Invalid shop URL. Use format: yourstore.myshopify.com" },
        { status: 400 }
      );
    }

    let shopName: string;
    try {
      const result = await validateShopifyConnection(shopUrl, accessToken);
      shopName = result.shopName;
    } catch (err) {
      if (err instanceof ShopifyAuthError) {
        return NextResponse.json(
          { error: "Invalid access token" },
          { status: 401 }
        );
      }
      if (err instanceof ShopifyNotFoundError) {
        return NextResponse.json(
          { error: "Store not found" },
          { status: 404 }
        );
      }
      const msg =
        err instanceof ShopifyError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      console.error(`[shopify/connect] validate: ${msg}`);
      return NextResponse.json(
        { error: "Could not reach Shopify" },
        { status: 502 }
      );
    }

    const admin = getAdminSupabase();
    const nowIso = new Date().toISOString();

    const { data: existing, error: selErr } = await admin
      .from("sales_sources")
      .select("id")
      .eq("project_id", projectId)
      .eq("source_type", "shopify")
      .maybeSingle();

    if (selErr) {
      console.error(`[shopify/connect] sales_sources select: ${selErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const sourceConfig = {
      shop_url: shopUrl,
      access_token: accessToken,
      shop_name: shopName,
      connected_at: nowIso,
    };

    // The (project_id, source_type) unique index is PARTIAL
    // (WHERE source_type != 'manual'), which PostgREST's
    // `.upsert(..., onConflict)` cannot target. Branch explicitly between
    // update and insert.
    if (existing?.id) {
      const { error: updErr } = await admin
        .from("sales_sources")
        .update({
          source_config: sourceConfig,
          status: "active",
          last_error: null,
          last_error_at: null,
          updated_at: nowIso,
        })
        .eq("id", existing.id);

      if (updErr) {
        console.error(`[shopify/connect] update: ${updErr.message}`);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
      }
    } else {
      const { error: insErr } = await admin
        .from("sales_sources")
        .insert({
          user_id: userId,
          project_id: projectId,
          source_type: "shopify",
          source_config: sourceConfig,
          status: "active",
        });

      if (insErr) {
        console.error(`[shopify/connect] insert: ${insErr.message}`);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, shop_name: shopName });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[shopify/connect] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[shopify/connect] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
