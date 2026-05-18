import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { setOAuthState } from "@/server/meta/oauth-state";
import {
  META_OAUTH_DIALOG,
  META_SCOPES,
  getMetaAppId,
  getRedirectUri,
} from "@/server/meta/meta-config";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getServerUserId();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const state = await setOAuthState();

  const dialog = new URL(META_OAUTH_DIALOG);
  dialog.searchParams.set("client_id", getMetaAppId());
  dialog.searchParams.set("redirect_uri", getRedirectUri());
  dialog.searchParams.set("scope", META_SCOPES.join(","));
  dialog.searchParams.set("state", state);
  dialog.searchParams.set("response_type", "code");

  return NextResponse.redirect(dialog.toString());
}
