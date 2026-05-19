import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { setOAuthState } from "@/server/meta/oauth-state";
import {
  META_OAUTH_DIALOG,
  getMetaAppId,
  getMetaScopes,
  getRedirectUri,
} from "@/server/meta/meta-config";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

/**
 * Modes:
 *   (default)            — first-time Connect / Reconnect after token loss
 *   reauthorize_bms      — same Meta user, force the consent dialog again so
 *                          user can grant access to additional Business Managers.
 *                          Implemented via `auth_type=rerequest`.
 *
 * Classic Facebook Login is used (no config_id). If `auth_type=rerequest`
 * still skips asset selection in your Meta App, switch to Facebook Login for
 * Business with a configured config_id — see operator docs.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Read env before doing any work — fails fast with a clear message.
    const clientId = getMetaAppId();
    const redirectUri = getRedirectUri();
    const mode = req.nextUrl.searchParams.get("mode");
    const isReauthBms = mode === "reauthorize_bms";

    const state = await setOAuthState();

    const dialog = new URL(META_OAUTH_DIALOG);
    dialog.searchParams.set("client_id", clientId);
    dialog.searchParams.set("redirect_uri", redirectUri);
    dialog.searchParams.set("scope", getMetaScopes().join(","));
    dialog.searchParams.set("state", state);
    dialog.searchParams.set("response_type", "code");

    if (isReauthBms) {
      // Re-prompt the Meta consent dialog so the user can re-select Business
      // Manager assets. Forces Meta to show the permission/asset screen even
      // if user already granted previously.
      dialog.searchParams.set("auth_type", "rerequest");
    }

    return NextResponse.redirect(dialog.toString());
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/connect] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/connect] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
