import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import { getAccessTokenForConnection } from "./token-store";
import { syncAdAccount, type SyncAdAccountResult } from "./sync-orchestrator";
import { debugLog, debugWarn } from "./sync-debug";

/**
 * Per-project sync runner.
 *
 * Resolves each active AA selection on a project to:
 *   - its meta_ad_accounts row (text id, fk uuid, currency)
 *   - the meta_connection_id that owns the parent BM membership
 *   - the OAuth access token for that connection
 *
 * Then calls syncAdAccount() per AA, sequentially. Sequential ordering
 * is intentional: Vercel's 60s function ceiling and the orchestrator's
 * 25s per-AA budget mean parallel runs would race the timeout.
 *
 * Returns aggregated per-AA results so the API layer can render them.
 */

export type AaSyncResult = {
  metaAdAccountId: string;
  adAccountName: string | null;
  result: SyncAdAccountResult;
};

export type SyncProjectResult = {
  ok: boolean;
  projectId: string;
  totalAccounts: number;
  results: AaSyncResult[];
  errorMessage?: string;
};

type AaRow = {
  id: string;
  meta_ad_account_id: string;
  ad_account_name: string | null;
  currency: string | null;
  meta_ad_account_id_text: string;
  meta_connection_id: string;
};

async function resolveProjectAdAccounts(
  userId: string,
  projectId: string
): Promise<AaRow[]> {
  const sb = getAdminSupabase();

  // Step 1: active AA selections for this project, with their BM membership.
  const { data: selections, error } = await sb
    .from("project_meta_ad_accounts")
    .select(
      "id, meta_ad_account_id, project_meta_business_manager_id, status"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to load project AAs: ${error.message}`);
  }
  const sel = (selections ?? []) as Array<{
    id: string;
    meta_ad_account_id: string;
    project_meta_business_manager_id: string;
    status: string;
  }>;
  if (sel.length === 0) return [];

  const aaRowIds = Array.from(new Set(sel.map((s) => s.meta_ad_account_id)));
  const bmMembershipIds = Array.from(
    new Set(sel.map((s) => s.project_meta_business_manager_id))
  );

  // Step 2: meta_ad_accounts (text id, currency, name).
  const { data: aaRows, error: aaErr } = await sb
    .from("meta_ad_accounts")
    .select("id, meta_ad_account_id, ad_account_name, currency, status")
    .eq("user_id", userId)
    .in("id", aaRowIds);

  if (aaErr) throw new Error(`Failed to load meta_ad_accounts: ${aaErr.message}`);
  const aaMap = new Map<
    string,
    {
      id: string;
      meta_ad_account_id: string;
      ad_account_name: string | null;
      currency: string | null;
    }
  >();
  for (const r of (aaRows ?? []) as Array<{
    id: string;
    meta_ad_account_id: string;
    ad_account_name: string | null;
    currency: string | null;
    status: string;
  }>) {
    if (r.status !== "active") continue;
    aaMap.set(r.id, {
      id: r.id,
      meta_ad_account_id: r.meta_ad_account_id,
      ad_account_name: r.ad_account_name,
      currency: r.currency,
    });
  }

  // Step 3: BM memberships → meta_connection_id.
  const { data: bmRows, error: bmErr } = await sb
    .from("project_meta_business_managers")
    .select("id, meta_connection_id, status")
    .eq("user_id", userId)
    .in("id", bmMembershipIds);

  if (bmErr) throw new Error(`Failed to load BM memberships: ${bmErr.message}`);
  const bmConnMap = new Map<string, string>();
  for (const r of (bmRows ?? []) as Array<{
    id: string;
    meta_connection_id: string | null;
    status: string;
  }>) {
    if (r.status !== "active" || !r.meta_connection_id) continue;
    bmConnMap.set(r.id, r.meta_connection_id);
  }

  // Step 4: assemble.
  const out: AaRow[] = [];
  for (const s of sel) {
    const aa = aaMap.get(s.meta_ad_account_id);
    const connId = bmConnMap.get(s.project_meta_business_manager_id);
    if (!aa || !connId) continue;
    out.push({
      id: aa.id,
      meta_ad_account_id: aa.id,
      ad_account_name: aa.ad_account_name,
      currency: aa.currency,
      meta_ad_account_id_text: aa.meta_ad_account_id,
      meta_connection_id: connId,
    });
  }
  return out;
}

export async function syncProject(params: {
  userId: string;
  projectId: string;
  isManual?: boolean;
}): Promise<SyncProjectResult> {
  let accounts: AaRow[];
  try {
    accounts = await resolveProjectAdAccounts(params.userId, params.projectId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "resolve failed";
    console.error(`[meta/sync] AA resolution failed: ${msg}`);
    // Above is intentionally console.error — resolution failure is rare and
    // indicates a DB/schema problem worth surfacing without the debug flag.
    return {
      ok: false,
      projectId: params.projectId,
      totalAccounts: 0,
      results: [],
      errorMessage: msg,
    };
  }

  debugLog(`[meta/sync] active AAs count ${accounts.length}`);
  if (accounts.length === 0) {
    debugWarn("[meta/sync] no active AAs — returning early");
    return {
      ok: true,
      projectId: params.projectId,
      totalAccounts: 0,
      results: [],
    };
  }

  const results: AaSyncResult[] = [];

  // Token cache per connection — avoid re-loading for multiple AAs on same BM.
  const tokenCache = new Map<string, string | null>();

  for (const aa of accounts) {
    debugLog(`[meta/sync] sync AA start ${aa.meta_ad_account_id_text}`);

    let token = tokenCache.get(aa.meta_connection_id);
    if (token === undefined) {
      debugLog(
        `[meta/sync] loading token for connection ${aa.meta_connection_id}`
      );
      const tk = await getAccessTokenForConnection(
        params.userId,
        aa.meta_connection_id
      );
      token = tk?.token ?? null;
      tokenCache.set(aa.meta_connection_id, token);
      debugLog(`[meta/sync] token loaded present=${token ? "yes" : "no"}`);
    }

    if (!token) {
      debugWarn(
        `[meta/sync] no active token for AA ${aa.meta_ad_account_id_text} — skipping`
      );
      results.push({
        metaAdAccountId: aa.meta_ad_account_id_text,
        adAccountName: aa.ad_account_name,
        result: {
          acquired: false,
          lockReason: "no_active_token",
          errorMessage:
            "Connection has no active token (disconnected or expired).",
        },
      });
      continue;
    }

    const syncResult = await syncAdAccount({
      userId: params.userId,
      metaAdAccountIdText: aa.meta_ad_account_id_text,
      metaAdAccountIdFk: aa.id,
      currency: aa.currency,
      accessToken: token,
      isManual: params.isManual,
    });

    debugLog(
      `[meta/sync] sync AA done ${aa.meta_ad_account_id_text} acquired=${syncResult.acquired} status=${
        syncResult.finalStatus ?? "n/a"
      } duration=${syncResult.durationMs ?? 0}ms`
    );

    results.push({
      metaAdAccountId: aa.meta_ad_account_id_text,
      adAccountName: aa.ad_account_name,
      result: syncResult,
    });
  }

  const hasError = results.some(
    (r) =>
      r.result.acquired === false ||
      r.result.finalStatus === "error" ||
      r.result.finalStatus === "partial"
  );

  return {
    ok: !hasError,
    projectId: params.projectId,
    totalAccounts: accounts.length,
    results,
  };
}
