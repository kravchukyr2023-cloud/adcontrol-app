import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { removeProjectBm } from "@/server/meta/wire-project";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

/**
 * DELETE /api/meta/project-bms/:id
 *   Soft-removes a BM membership (status='inactive').
 *   Cascade soft-deselects all AA selections under it.
 *   Sync states preserved (resource may be active in another project).
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
      console.error(`[meta/project-bms/:id] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/project-bms/:id] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(membershipId: string) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!membershipId) {
    return NextResponse.json(
      { error: "membership id required" },
      { status: 400 }
    );
  }

  // Verify ownership of the membership row.
  const sb = getAdminSupabase();
  const { data: row } = await sb
    .from("project_meta_business_managers")
    .select("id, user_id, status")
    .eq("id", membershipId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((row as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await removeProjectBm({
    userId,
    projectMetaBusinessManagerId: membershipId,
  });

  return NextResponse.json({ ok: true });
}
