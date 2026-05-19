import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { deselectProjectAa } from "@/server/meta/wire-project";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

/**
 * DELETE /api/meta/project-aas/:id
 *   Soft-deselects an AA selection (status='inactive').
 *   Sync states preserved (resource may be selected elsewhere).
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    return await handle(id);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/project-aas/:id] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/project-aas/:id] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(selectionId: string) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!selectionId) {
    return NextResponse.json(
      { error: "selection id required" },
      { status: 400 }
    );
  }

  const sb = getAdminSupabase();
  const { data: row } = await sb
    .from("project_meta_ad_accounts")
    .select("id, user_id")
    .eq("id", selectionId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((row as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deselectProjectAa({
    userId,
    projectMetaAdAccountId: selectionId,
  });

  return NextResponse.json({ ok: true });
}
