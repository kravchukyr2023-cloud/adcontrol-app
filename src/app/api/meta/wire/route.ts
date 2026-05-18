import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { wireProject } from "@/server/meta/wire-project";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { getActiveConnection } from "@/server/meta/token-store";

export const runtime = "nodejs";

type WireBody = {
  project_id?: string;
  meta_bm_id?: string;
  meta_ad_account_id?: string;
};

export async function POST(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WireBody;
  try {
    body = (await req.json()) as WireBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, meta_bm_id, meta_ad_account_id } = body;
  if (!project_id || !meta_bm_id || !meta_ad_account_id) {
    return NextResponse.json(
      { error: "project_id, meta_bm_id, meta_ad_account_id required" },
      { status: 400 }
    );
  }

  // Verify project ownership server-side (don't trust client).
  const supabase = await getServerSupabase();
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", project_id)
    .maybeSingle();

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if ((project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conn = await getActiveConnection(userId);
  if (!conn) {
    return NextResponse.json(
      { error: "No active Meta connection. Connect Meta first." },
      { status: 400 }
    );
  }

  // Resolve cache row IDs for the chosen BM + Ad Account.
  const adminSupabase = getAdminSupabase();

  const { data: bmRow } = await adminSupabase
    .from("meta_business_managers")
    .select("id, meta_bm_id, bm_name")
    .eq("user_id", userId)
    .eq("meta_bm_id", meta_bm_id)
    .maybeSingle();

  const { data: aaRow } = await adminSupabase
    .from("meta_ad_accounts")
    .select("id, meta_ad_account_id, ad_account_name")
    .eq("user_id", userId)
    .eq("meta_ad_account_id", meta_ad_account_id)
    .maybeSingle();

  if (!bmRow || !aaRow) {
    return NextResponse.json(
      { error: "Cached BM/Ad Account not found. Refresh lists first." },
      { status: 404 }
    );
  }

  try {
    const { bindingId } = await wireProject({
      userId,
      projectId: project_id,
      metaConnectionId: conn.id,
      metaBmRowId: (bmRow as { id: string }).id,
      metaAdAccountRowId: (aaRow as { id: string }).id,
      metaUserId: conn.meta_user_id,
      metaBmId: meta_bm_id,
      metaAdAccountId: meta_ad_account_id,
    });

    return NextResponse.json({ ok: true, binding_id: bindingId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Wiring failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
