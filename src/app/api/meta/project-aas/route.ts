import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { getConnectionById } from "@/server/meta/token-store";
import { selectProjectAa } from "@/server/meta/wire-project";
import { isMissingEnvError } from "@/server/env";
import {
  enforceAddAaLimit,
  isQuotaExceededError,
} from "@/server/billing/enforce-wire-limits";

export const runtime = "nodejs";

/**
 * POST /api/meta/project-aas
 *   body: {
 *     project_meta_business_manager_id: <uuid>,
 *     meta_ad_account_id: <Facebook AA id, e.g. "act_xxx">
 *   }
 *   -> selects (or reactivates) an Ad Account under the given BM membership.
 *   Quota enforced before mutation.
 */

type PostBody = {
  project_meta_business_manager_id?: string;
  meta_ad_account_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/project-aas] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/project-aas] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { project_meta_business_manager_id, meta_ad_account_id } = body;
  if (!project_meta_business_manager_id || !meta_ad_account_id) {
    return NextResponse.json(
      {
        error:
          "project_meta_business_manager_id and meta_ad_account_id required",
      },
      { status: 400 }
    );
  }

  const sb = getAdminSupabase();

  // Verify membership ownership + active status; capture project_id, BM cache
  // id, AND the connection_id that this BM was bound under (project-scoped).
  const { data: mem } = await sb
    .from("project_meta_business_managers")
    .select(
      "id, user_id, project_id, status, meta_business_manager_id, meta_connection_id, meta_business_managers(meta_bm_id)"
    )
    .eq("id", project_meta_business_manager_id)
    .maybeSingle();

  if (!mem) {
    return NextResponse.json(
      { error: "BM membership not found" },
      { status: 404 }
    );
  }
  const m = mem as unknown as {
    id: string;
    user_id: string;
    project_id: string;
    status: string;
    meta_business_manager_id: string;
    meta_connection_id: string | null;
    meta_business_managers: { meta_bm_id: string } | null;
  };
  if (m.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (m.status !== "active") {
    return NextResponse.json(
      { error: "BM membership is not active" },
      { status: 409 }
    );
  }

  // Use the membership's bound connection — multi-FB safe. Each project's BM
  // membership carries its own meta_connection_id, so the right Meta user is
  // always picked here.
  if (!m.meta_connection_id) {
    return NextResponse.json(
      { error: "BM membership has no Meta connection. Re-add the BM." },
      { status: 400 }
    );
  }
  const conn = await getConnectionById(userId, m.meta_connection_id);
  if (!conn) {
    return NextResponse.json(
      { error: "Meta connection not found. Reconnect first." },
      { status: 400 }
    );
  }

  // Resolve AA cache row id.
  const { data: aaRow } = await sb
    .from("meta_ad_accounts")
    .select("id, meta_ad_account_id")
    .eq("user_id", userId)
    .eq("meta_ad_account_id", meta_ad_account_id)
    .maybeSingle();

  if (!aaRow) {
    return NextResponse.json(
      { error: "Cached Ad Account not found. Refresh Ad Account list first." },
      { status: 404 }
    );
  }
  const metaAaRowId = (aaRow as { id: string }).id;

  try {
    await enforceAddAaLimit({
      userId,
      projectId: m.project_id,
      metaAdAccountRowId: metaAaRowId,
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      return NextResponse.json(
        {
          error: err.code,
          scope: err.scope,
          limit: err.limit,
          used: err.used,
        },
        { status: 402 }
      );
    }
    throw err;
  }

  const { projectMetaAdAccountId } = await selectProjectAa({
    userId,
    projectId: m.project_id,
    projectMetaBusinessManagerId: m.id,
    metaAaRowId,
    metaUserId: conn.meta_user_id,
    metaBmId: m.meta_business_managers?.meta_bm_id ?? "",
    metaAdAccountId: meta_ad_account_id,
  });

  return NextResponse.json({
    ok: true,
    project_meta_ad_account_id: projectMetaAdAccountId,
  });
}
