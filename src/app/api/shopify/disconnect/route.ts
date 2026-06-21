import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

type Body = { project_id?: unknown };

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
      console.error(`[shopify/disconnect] project lookup: ${projErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminSupabase();

    // Hard delete so the partial unique index (project_id, source_type)
    // treats this slot as empty — a subsequent connect inserts cleanly.
    const { error: delErr } = await admin
      .from("sales_sources")
      .delete()
      .eq("project_id", projectId)
      .eq("source_type", "shopify");

    if (delErr) {
      console.error(`[shopify/disconnect] delete: ${delErr.message}`);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[shopify/disconnect] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[shopify/disconnect] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
