import { NextRequest, NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { verifyAndClearOAuthState } from "@/server/meta/oauth-state";
import { exchangeCodeForLongToken } from "@/server/meta/exchange-code";
import { fetchMetaUser } from "@/server/meta/fetch-meta-user";
import { saveConnection } from "@/server/meta/token-store";
import { getMetaScopes } from "@/server/meta/meta-config";
import { recordConnectionEvent } from "@/server/meta/connection-events";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

function html(success: boolean, error?: string): string {
  const safeError = (error ?? "").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Meta Connection</title>
  <style>
    body { background: #0c0e18; color: #fff; font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; max-width: 360px; padding: 24px; }
    .ok { color: #34d399; }
    .err { color: #f87171; }
  </style>
</head>
<body>
  <div class="box">
    ${success
      ? `<h2 class="ok">Connected</h2><p>You can close this window.</p>`
      : `<h2 class="err">Connection failed</h2><p>${safeError || "Please try again."}</p>`}
  </div>
  <script>
    (function () {
      var success = ${success ? "true" : "false"};
      var err = ${success ? "null" : JSON.stringify(error ?? "")};
      try {
        if (window.opener) {
          window.opener.postMessage({ type: "meta_oauth_result", success: success, error: err }, window.location.origin);
        }
      } catch (e) {}
      setTimeout(function () { try { window.close(); } catch (e) {} }, 500);
    })();
  </script>
</body>
</html>`;
}

function htmlResponse(body: string, status: number = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/callback] ${err.message}`);
      return htmlResponse(html(false, `Server misconfiguration: ${err.message}`), 500);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/callback] ${msg}`);
    return htmlResponse(html(false, msg), 500);
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return htmlResponse(html(false, "Not authenticated"), 401);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (error) {
    await recordConnectionEvent({
      userId,
      connectionId: null,
      eventType: "error",
      status: "failed",
      message: errorDescription || error,
      metadata: { phase: "meta_authorization_error" },
    });
    return htmlResponse(html(false, errorDescription || error));
  }

  if (!code || !state) {
    await recordConnectionEvent({
      userId,
      connectionId: null,
      eventType: "error",
      status: "failed",
      message: "Missing code or state",
      metadata: { phase: "callback_invalid" },
    });
    return htmlResponse(html(false, "Missing code or state"));
  }

  const stateValid = await verifyAndClearOAuthState(state);
  if (!stateValid) {
    await recordConnectionEvent({
      userId,
      connectionId: null,
      eventType: "error",
      status: "failed",
      message: "Invalid or expired state",
      metadata: { phase: "state_verify" },
    });
    return htmlResponse(html(false, "Invalid or expired state"));
  }

  try {
    const { token, expiresAt } = await exchangeCodeForLongToken(code);
    const metaUser = await fetchMetaUser(token);
    const scope = getMetaScopes().join(",");

    const { connectionId, isReconnect } = await saveConnection({
      userId,
      metaUserId: metaUser.id,
      metaUserName: metaUser.name,
      accessToken: token,
      expiresAt,
      scope,
    });

    await recordConnectionEvent({
      userId,
      connectionId,
      eventType: isReconnect ? "reconnect" : "connect",
      status: "success",
      message: `${isReconnect ? "Reconnected" : "Connected"} as ${metaUser.name ?? metaUser.id}`,
      metadata: {
        meta_user_id: metaUser.id,
        scope,
        token_expires_at: expiresAt?.toISOString() ?? null,
      },
    });

    return htmlResponse(html(true));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordConnectionEvent({
      userId,
      connectionId: null,
      eventType: "error",
      status: "failed",
      message: msg,
      metadata: { phase: "exchange_or_save" },
    });
    return htmlResponse(html(false, msg));
  }
}
