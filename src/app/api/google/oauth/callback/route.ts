import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { verifyGoogleState } from "@/server/google/oauth-state";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/google/oauth";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

function redirectToDataSources(url: URL, params: Record<string, string>) {
  const target = new URL("/data-sources", url.origin);
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }
  return NextResponse.redirect(target.toString());
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return redirectToDataSources(req.nextUrl, { error: "unauthorized" });
    }

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const oauthError = req.nextUrl.searchParams.get("error");

    if (oauthError) {
      console.warn(`[google/oauth/callback] google returned error: ${oauthError}`);
      return redirectToDataSources(req.nextUrl, { error: oauthError });
    }

    if (!code || !state) {
      return redirectToDataSources(req.nextUrl, { error: "missing_code_or_state" });
    }

    const payload = verifyGoogleState(state);
    if (!payload) {
      return redirectToDataSources(req.nextUrl, { error: "invalid_state" });
    }

    if (payload.userId !== userId) {
      // Session user differs from the user that initiated OAuth — abort.
      return redirectToDataSources(req.nextUrl, { error: "user_mismatch" });
    }

    const { access_token, refresh_token } = await exchangeGoogleCode(code);

    let googleEmail: string | null = null;
    try {
      const info = await fetchGoogleUserInfo(access_token);
      googleEmail = info.email ?? null;
    } catch (err) {
      // Non-fatal: connection succeeds without email, sync still works.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[google/oauth/callback] userinfo failed: ${msg}`);
    }

    const admin = getAdminSupabase();
    const nowIso = new Date().toISOString();

    // Read existing config so we preserve spreadsheet_id / sheet_name if the
    // user is re-authorizing the same project (token refresh, scope change).
    const { data: existing } = await admin
      .from("sales_sources")
      .select("id, source_config")
      .eq("project_id", payload.projectId)
      .eq("source_type", "google_sheets")
      .maybeSingle();

    const existingConfig =
      (existing?.source_config as Record<string, unknown> | null) ?? {};

    const mergedConfig = {
      ...existingConfig,
      refresh_token,
      google_email: googleEmail,
      connected_at: nowIso,
    };

    // sales_sources has a *partial* unique index
    // (project_id, source_type) WHERE source_type != 'manual', which
    // PostgREST's `.upsert(..., onConflict)` cannot target. We branch
    // explicitly between insert and update instead.
    if (existing?.id) {
      const { error: updErr } = await admin
        .from("sales_sources")
        .update({
          source_config: mergedConfig,
          status: "active",
          last_error: null,
          last_error_at: null,
          updated_at: nowIso,
        })
        .eq("id", existing.id);

      if (updErr) {
        console.error(`[google/oauth/callback] update sales_sources: ${updErr.message}`);
        return redirectToDataSources(req.nextUrl, { error: "db_error" });
      }
    } else {
      const { error: insErr } = await admin
        .from("sales_sources")
        .insert({
          user_id: userId,
          project_id: payload.projectId,
          source_type: "google_sheets",
          source_config: mergedConfig,
          status: "active",
        });

      if (insErr) {
        console.error(`[google/oauth/callback] insert sales_sources: ${insErr.message}`);
        return redirectToDataSources(req.nextUrl, { error: "db_error" });
      }
    }

    return redirectToDataSources(req.nextUrl, {
      success: "google_sheets_connected",
      project_id: payload.projectId,
    });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[google/oauth/callback] ${err.message}`);
      return redirectToDataSources(req.nextUrl, {
        error: "server_misconfiguration",
      });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[google/oauth/callback] ${msg}`);
    return redirectToDataSources(req.nextUrl, { error: "exchange_failed" });
  }
}
