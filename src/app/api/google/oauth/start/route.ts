import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getServerUserId } from "@/lib/supabase/server";
import { getGoogleAuthUrl } from "@/lib/google/oauth";
import { signGoogleState } from "@/server/google/oauth-state";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    const sb = await getServerSupabase();
    const { data: project, error } = await sb
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(`[google/oauth/start] project lookup: ${error.message}`);
      return NextResponse.json(
        { error: "DB error loading project" },
        { status: 500 }
      );
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const state = signGoogleState({ projectId, userId });
    const authUrl = getGoogleAuthUrl(state);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[google/oauth/start] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[google/oauth/start] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
