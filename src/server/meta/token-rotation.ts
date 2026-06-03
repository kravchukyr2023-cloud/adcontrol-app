import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import {
  META_GRAPH_BASE,
  getMetaAppId,
  getMetaAppSecret,
} from "./meta-config";
import { recordConnectionEvent } from "./connection-events";

/**
 * Automatic Meta long-token rotation.
 *
 * Background:
 *   Meta long-lived tokens last ~60 days. Without rotation they silently
 *   expire and every sync after that fails with Meta error 190. The user
 *   has no way to know the token died — they just see "Failed" syncs.
 *
 *   This module rotates the token in-place before it expires by issuing
 *   another fb_exchange_token call (Meta accepts a non-expired long token
 *   as input and returns a fresh long token). New token + new expiry are
 *   written back to meta_connection_tokens / meta_connections.
 *
 * Architectural choice:
 *   Rotation is triggered from sync flow (orchestrator + project layer)
 *   rather than a separate cron. Reason: sync runs frequently enough
 *   (manual triggers + upcoming auto-sync cron) to hit the rotation
 *   window naturally. One less moving part.
 *
 * Concurrency:
 *   No advisory locks. If two syncs race the rotation for the same
 *   connection, both call fb_exchange_token (Meta accepts that) and the
 *   last write to meta_connection_tokens wins. Both new tokens are
 *   valid in practice — token rotation does not invalidate the source
 *   token. sync-project.ts deduplicates within a single project sync
 *   call; cross-call races are accepted.
 */

/**
 * Result of refreshTokenIfNeeded.
 *
 *   ok=true, still_valid     — token has > 7 days left; nothing done.
 *   ok=true, rotated         — token was refreshed; caller should
 *                              re-read access_token from token-store.
 *   ok=false, no_connection  — connection row missing, or status≠active,
 *                              or no token row to rotate. Sync MUST NOT
 *                              proceed. UI should prompt reconnect.
 *   ok=false, rotation_failed— Meta rejected the exchange (e.g. error
 *                              190 = token already invalid). Connection
 *                              marked status='expired'. UI shows the
 *                              expired CTA.
 *   ok=false, transient_failure
 *                            — Meta returned 5xx / network blip /
 *                              parse error. Connection NOT marked
 *                              expired — token may still be usable.
 *                              Sync may proceed with current token;
 *                              next sync retries rotation.
 */
export type RefreshResult =
  | { ok: true; reason: "still_valid" | "rotated" }
  | {
      ok: false;
      reason: "rotation_failed" | "no_connection" | "transient_failure";
    };

/** Rotate when fewer than this many days remain on the long-lived token. */
const ROTATION_THRESHOLD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Remove the literal token value from any string before it lands in logs
 * or the meta_connection_events.message column. Two passes:
 *
 *   1. Replace every occurrence of the actual token string (catches JSON
 *      echoes like `"access_token":"EAA..."`, plain echoes, URL echoes —
 *      anything that literally contains the token).
 *   2. Belt-and-suspenders regex for `access_token=…` URL patterns in
 *      case Meta returns a different/partial token we don't have a
 *      reference for.
 *
 * Defense-in-depth: Meta should never echo our token back, but log
 * sanitisation here is cheap and prevents a single Meta API change from
 * silently leaking long-lived tokens into our logs / DB.
 */
function scrubToken(msg: string, token: string): string {
  let scrubbed =
    token.length > 0 ? msg.replaceAll(token, "REDACTED") : msg;
  scrubbed = scrubbed.replace(
    /([?&])access_token=[^&\s"]*/g,
    "$1access_token=REDACTED"
  );
  return scrubbed;
}

type MetaExchangeResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
  };
};

export async function refreshTokenIfNeeded(
  connectionId: string
): Promise<RefreshResult> {
  const sb = getAdminSupabase();

  // 1. Load connection state.
  const { data: connRow, error: connErr } = await sb
    .from("meta_connections")
    .select("id, user_id, status, token_expires_at")
    .eq("id", connectionId)
    .maybeSingle();

  if (connErr || !connRow) {
    return { ok: false, reason: "no_connection" };
  }

  const conn = connRow as {
    id: string;
    user_id: string;
    status: string;
    token_expires_at: string | null;
  };

  if (conn.status !== "active") {
    return { ok: false, reason: "no_connection" };
  }

  // 2. Compute days until expiry. NULL is treated as 0 — those rows
  //    pre-date the column being populated; rotating fills it in.
  const expiresAtMs = conn.token_expires_at
    ? new Date(conn.token_expires_at).getTime()
    : 0;
  const daysUntilExpiry =
    expiresAtMs === 0
      ? 0
      : (expiresAtMs - Date.now()) / MS_PER_DAY;

  if (daysUntilExpiry > ROTATION_THRESHOLD_DAYS) {
    return { ok: true, reason: "still_valid" };
  }

  // 3. Need to rotate. Load the current token.
  const { data: tokRow } = await sb
    .from("meta_connection_tokens")
    .select("access_token")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (!tokRow) {
    // No token row to rotate from — treat as broken connection.
    console.error(
      `[token-rotation] no token row for connectionId=${connectionId}`
    );
    return { ok: false, reason: "no_connection" };
  }

  const currentToken = (tokRow as { access_token: string }).access_token;

  // 4. POST to Meta.
  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", getMetaAppId());
  url.searchParams.set("client_secret", getMetaAppSecret());
  url.searchParams.set("fb_exchange_token", currentToken);

  let resp: Response;
  try {
    resp = await fetch(url.toString(), { method: "GET" });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "fetch failed";
    const safeMsg = scrubToken(rawMsg, currentToken);
    console.warn(
      `[token-rotation] transient failure connectionId=${connectionId} reason=${safeMsg}, will retry`
    );
    return { ok: false, reason: "transient_failure" };
  }

  // 4a. 5xx — Meta-side transient. Don't mark expired; retry next sync.
  if (resp.status >= 500 && resp.status < 600) {
    let body = "";
    try {
      body = await resp.text();
    } catch {
      /* ignore */
    }
    const safeBody = scrubToken(body, currentToken).slice(0, 200);
    console.warn(
      `[token-rotation] transient failure connectionId=${connectionId} HTTP ${resp.status} body=${safeBody}, will retry`
    );
    return { ok: false, reason: "transient_failure" };
  }

  // 4b. Parse the response body.
  let data: MetaExchangeResponse;
  try {
    data = (await resp.json()) as MetaExchangeResponse;
  } catch {
    console.warn(
      `[token-rotation] transient failure connectionId=${connectionId} unparseable response, will retry`
    );
    return { ok: false, reason: "transient_failure" };
  }

  // 4c. 4xx, Meta error, or missing fields → permanent rotation failure.
  //     User must reconnect Meta. Mark connection expired.
  if (
    !resp.ok ||
    data.error ||
    !data.access_token ||
    typeof data.expires_in !== "number"
  ) {
    // Scrub the raw message — `data.error.message` from Meta could
    // theoretically include the token (rare but possible on validation
    // errors). errorMsg lands in BOTH console.error AND the audit-event
    // row in meta_connection_events, so scrubbing once here covers both.
    const rawMsg =
      data.error?.message ??
      (data.access_token
        ? "Missing expires_in in response"
        : `HTTP ${resp.status}: missing access_token`);
    const errorMsg = scrubToken(rawMsg, currentToken);
    console.error(
      `[token-rotation] failed connectionId=${connectionId} reason=${errorMsg} code=${data.error?.code ?? "n/a"}`
    );

    const now = new Date().toISOString();
    await sb
      .from("meta_connections")
      .update({
        status: "expired",
        connection_status: "expired",
        updated_at: now,
      })
      .eq("id", connectionId);

    await recordConnectionEvent({
      userId: conn.user_id,
      connectionId,
      eventType: "token_expired",
      status: "failed",
      message: errorMsg,
      metadata: {
        phase: "token_rotation",
        meta_error_code: data.error?.code ?? null,
        meta_error_subcode: data.error?.error_subcode ?? null,
        days_until_expiry: daysUntilExpiry,
      },
    });

    return { ok: false, reason: "rotation_failed" };
  }

  // 5. Success — write new token + new expires_at.
  const newExpiresAt = new Date(
    Date.now() + data.expires_in * 1000
  ).toISOString();
  const now = new Date().toISOString();

  const { error: tokUpdErr } = await sb
    .from("meta_connection_tokens")
    .update({
      access_token: data.access_token,
      updated_at: now,
    })
    .eq("connection_id", connectionId);

  if (tokUpdErr) {
    // Scrub the DB error message: defensive against Postgres errors that
    // occasionally echo column values (e.g. "value '…' too long for type")
    // — which here would be the freshly-issued long-lived token.
    const safeDbMsg = scrubToken(tokUpdErr.message, data.access_token);
    console.error(
      `[token-rotation] DB error writing new token connectionId=${connectionId}: ${safeDbMsg}`
    );
    // Don't mark expired — DB error isn't Meta's fault. Treat as transient.
    return { ok: false, reason: "transient_failure" };
  }

  await sb
    .from("meta_connections")
    .update({
      token_expires_at: newExpiresAt,
      updated_at: now,
    })
    .eq("id", connectionId);

  console.log(
    `[token-rotation] rotated connectionId=${connectionId} new_expires_at=${newExpiresAt}`
  );

  await recordConnectionEvent({
    userId: conn.user_id,
    connectionId,
    eventType: "token_refresh",
    status: "success",
    message: `Token rotated, new expiry ${newExpiresAt}`,
    metadata: {
      phase: "token_rotation",
      previous_days_until_expiry: daysUntilExpiry,
      new_expires_at: newExpiresAt,
    },
  });

  return { ok: true, reason: "rotated" };
}
