import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

type ConnectionStatus = "active" | "expired" | "disconnected" | "none";

export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/overview] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/overview] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id query param required" },
      { status: 400 }
    );
  }

  const userSb = await getServerSupabase();
  const { data: project, error: projErr } = await userSb
    .from("projects")
    .select("id, user_id, name, timezone")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const proj = project as {
    id: string;
    user_id: string;
    name: string;
    timezone: string | null;
  };
  if (proj.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getAdminSupabase();

  // Resolve the connection THIS project uses (project-scoped, multi-FB safe).
  // If project has no bindings yet, fall back to user's most-recent active
  // connection — useful for first-time UX when user has connected Meta
  // globally but not yet bound it to any project.
  const { data: projectBmRow } = await sb
    .from("project_meta_business_managers")
    .select("meta_connection_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active")
    .not("meta_connection_id", "is", null)
    .limit(1)
    .maybeSingle();

  let connRow: unknown = null;
  const boundConnectionId =
    (projectBmRow as { meta_connection_id: string | null } | null)
      ?.meta_connection_id ?? null;

  if (boundConnectionId) {
    const r = await sb
      .from("meta_connections")
      .select(
        "id, meta_user_id, meta_user_name, status, token_expires_at, last_connected_at"
      )
      .eq("id", boundConnectionId)
      .maybeSingle();
    connRow = r.data;
  } else {
    // No project binding yet — return user-global latest as fallback for the
    // pre-binding UX (e.g. user just connected Meta but hasn't added a BM).
    const r = await sb
      .from("meta_connections")
      .select(
        "id, meta_user_id, meta_user_name, status, token_expires_at, last_connected_at"
      )
      .eq("user_id", userId)
      .order("last_connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    connRow = r.data;
  }

  let connection_status: ConnectionStatus = "none";
  let connection_meta_user_name: string | null = null;
  let connection_token_expires_at: string | null = null;
  let connection_last_connected_at: string | null = null;

  if (connRow) {
    const c = connRow as {
      status: string;
      meta_user_name: string | null;
      token_expires_at: string | null;
      last_connected_at: string | null;
    };
    connection_meta_user_name = c.meta_user_name;
    connection_token_expires_at = c.token_expires_at;
    connection_last_connected_at = c.last_connected_at;

    if (c.status === "active") {
      connection_status =
        c.token_expires_at &&
        new Date(c.token_expires_at).getTime() < Date.now()
          ? "expired"
          : "active";
    } else if (c.status === "expired") {
      connection_status = "expired";
    } else {
      connection_status = "disconnected";
    }
  }

  // Active BM memberships for this project + nested cache info.
  const { data: bmMems } = await sb
    .from("project_meta_business_managers")
    .select(
      "id, status, added_at, meta_business_manager_id, " +
        "meta_business_managers(id, meta_bm_id, bm_name, status)"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("added_at", { ascending: true });

  const bmRows = (bmMems ?? []) as unknown as Array<{
    id: string;
    status: string;
    added_at: string;
    meta_business_manager_id: string | null;
    meta_business_managers: {
      id: string;
      meta_bm_id: string;
      bm_name: string | null;
      status: string;
    } | null;
  }>;

  // Active AA selections under those memberships.
  const memIds = bmRows.map((r) => r.id);
  type AaRow = {
    id: string;
    status: string;
    selected_at: string;
    project_meta_business_manager_id: string;
    meta_ad_account_id: string | null;
    meta_ad_accounts: {
      id: string;
      meta_ad_account_id: string;
      ad_account_name: string | null;
      currency: string | null;
      meta_account_status_code: number | null;
      status: string;
    } | null;
  };
  let aaRows: AaRow[] = [];
  if (memIds.length > 0) {
    const { data: aaSelections } = await sb
      .from("project_meta_ad_accounts")
      .select(
        "id, status, selected_at, project_meta_business_manager_id, meta_ad_account_id, " +
          "meta_ad_accounts(id, meta_ad_account_id, ad_account_name, currency, meta_account_status_code, status)"
      )
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("status", "active")
      .in("project_meta_business_manager_id", memIds)
      .order("selected_at", { ascending: true });

    aaRows = (aaSelections ?? []) as unknown as AaRow[];
  }

  // Compose hierarchical response.
  const business_managers = bmRows.map((m) => {
    const aas = aaRows
      .filter((a) => a.project_meta_business_manager_id === m.id)
      .map((a) => ({
        id: a.id, // project_meta_ad_account_id
        meta_ad_account_id: a.meta_ad_accounts?.meta_ad_account_id ?? null,
        name: a.meta_ad_accounts?.ad_account_name ?? null,
        currency: a.meta_ad_accounts?.currency ?? null,
        account_status_code:
          a.meta_ad_accounts?.meta_account_status_code ?? null,
        status: a.status,
        cache_status: a.meta_ad_accounts?.status ?? null,
        selected_at: a.selected_at,
      }));

    return {
      id: m.id, // project_meta_business_manager_id
      meta_bm_id: m.meta_business_managers?.meta_bm_id ?? null,
      name: m.meta_business_managers?.bm_name ?? null,
      status: m.status,
      cache_status: m.meta_business_managers?.status ?? null,
      added_at: m.added_at,
      ad_accounts: aas,
    };
  });

  return NextResponse.json({
    project: { id: proj.id, name: proj.name },
    connection: {
      status: connection_status,
      meta_user_name: connection_meta_user_name,
      token_expires_at: connection_token_expires_at,
      last_connected_at: connection_last_connected_at,
    },
    business_managers,
    timezone: proj.timezone,
  });
}
