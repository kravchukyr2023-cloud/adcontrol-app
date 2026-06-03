import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";

/**
 * GET /api/meta/analytics
 *   ?project_id=<uuid>                       (required)
 *   [&since=YYYY-MM-DD&until=YYYY-MM-DD]     (optional date overrides)
 *   [&bm_id=<meta_bm_id>]                    (optional BM filter)
 *   [&ad_account_id=<act_xxx>]               (optional AA filter; overrides bm_id)
 *
 * Project-scoped, Ads-Manager-like read API:
 *
 *   - Default window: month-to-date (1st of current month → today).
 *   - AA scope:
 *       no filters         → all active selections on this project
 *       bm_id              → only active selections under that BM membership
 *       ad_account_id      → only that AA, if it is actively selected here
 *       (ad_account_id always overrides bm_id)
 *   - Project isolation: nothing is ever returned from an AA that is not
 *     currently active in project_meta_ad_accounts for this user/project.
 *   - Campaign inclusion (Ads-Manager parity):
 *       A) DB status IN ('active','paused')  [currently active or paused], OR
 *       B) had any delivery in the period
 *          (spend > 0 OR impressions > 0 OR clicks > 0 OR purchases > 0).
 *     Path B brings back campaigns that became archived/deleted later but
 *     spent during the selected window.
 *   - Revenue and ROAS return null in V1 (action_values not decoded yet).
 *
 * Adset/ad-level data is NOT returned here. A future drill-down endpoint
 * will follow the same scoping rules.
 */

type Summary = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
};

function emptySummary(): Summary {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    revenue: null,
    ctr: null,
    cpc: null,
    cpm: null,
    roas: null,
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Month-to-date: first day of current month (UTC) through today (UTC). */
function monthToDate(): { since: string; until: string } {
  const today = new Date();
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  );
  return { since: toIsoDate(monthStart), until: toIsoDate(today) };
}

function parseNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function deriveRates(s: {
  spend: number;
  impressions: number;
  clicks: number;
  revenue: number | null;
}): {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
} {
  const ctr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : null;
  const cpc = s.clicks > 0 ? s.spend / s.clicks : null;
  const cpm = s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null;
  const roas =
    s.revenue !== null && s.spend > 0 ? s.revenue / s.spend : null;
  return { ctr, cpc, cpm, roas };
}

type CampaignAgg = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  hasRevenue: boolean;
};

function emptyCampaignAgg(): CampaignAgg {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    revenue: 0,
    hasRevenue: false,
  };
}

export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[meta/analytics] env missing: ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meta/analytics] ERROR ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id required" },
      { status: 400 }
    );
  }
  const bmIdFilter = url.searchParams.get("bm_id");
  const adAccountIdFilter = url.searchParams.get("ad_account_id");

  // Date range: month-to-date by default; query overrides if provided.
  const mtd = monthToDate();
  const since = url.searchParams.get("since") ?? mtd.since;
  const until = url.searchParams.get("until") ?? mtd.until;

  // Project ownership via @supabase/ssr.
  const supabase = await getServerSupabase();
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if ((project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getAdminSupabase();

  // -------------------- 1. PROJECT AA CONTEXT --------------------
  // Active selections, with their parent BM-membership id for filter resolution.
  const { data: selections, error: selErr } = await admin
    .from("project_meta_ad_accounts")
    .select("meta_ad_account_id, project_meta_business_manager_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active");
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  const selectionRows = (selections ?? []) as Array<{
    meta_ad_account_id: string;
    project_meta_business_manager_id: string;
  }>;

  if (selectionRows.length === 0) {
    return NextResponse.json({
      ok: true,
      dateRange: { since, until },
      lastSyncedAt: null,
      adAccounts: [],
      summary: emptySummary(),
      campaigns: [],
    });
  }

  const aaRowIds = Array.from(
    new Set(selectionRows.map((s) => s.meta_ad_account_id))
  );
  const bmMembershipIds = Array.from(
    new Set(selectionRows.map((s) => s.project_meta_business_manager_id))
  );

  // 1a. AA metadata (id, meta text id, currency, name, status).
  const { data: aaRows, error: aaErr } = await admin
    .from("meta_ad_accounts")
    .select(
      "id, meta_ad_account_id, ad_account_name, currency, status, meta_account_status_code"
    )
    .eq("user_id", userId)
    .in("id", aaRowIds);
  if (aaErr) {
    return NextResponse.json({ error: aaErr.message }, { status: 500 });
  }
  const aaRowsList = (aaRows ?? []) as Array<{
    id: string;
    meta_ad_account_id: string;
    ad_account_name: string | null;
    currency: string | null;
    status: string;
    meta_account_status_code: number | null;
  }>;
  const aaRowById = new Map(aaRowsList.map((a) => [a.id, a]));

  // 1b. Active BM memberships (status filter — disconnected memberships excluded).
  const { data: bmMemberships, error: bmMemErr } = await admin
    .from("project_meta_business_managers")
    .select("id, meta_business_manager_id, status")
    .eq("user_id", userId)
    .in("id", bmMembershipIds);
  if (bmMemErr) {
    return NextResponse.json({ error: bmMemErr.message }, { status: 500 });
  }
  const activeMemberships = (
    (bmMemberships ?? []) as Array<{
      id: string;
      meta_business_manager_id: string;
      status: string;
    }>
  ).filter((m) => m.status === "active");
  const membershipById = new Map(activeMemberships.map((m) => [m.id, m]));

  // 1c. meta_business_managers — resolve uuid → text bm_id for filter matching.
  const metaBmRowIds = Array.from(
    new Set(activeMemberships.map((m) => m.meta_business_manager_id))
  );
  let bmRowsList: Array<{ id: string; meta_bm_id: string }> = [];
  if (metaBmRowIds.length > 0) {
    const { data: bmRows, error: bmErr } = await admin
      .from("meta_business_managers")
      .select("id, meta_bm_id")
      .eq("user_id", userId)
      .in("id", metaBmRowIds);
    if (bmErr) {
      return NextResponse.json({ error: bmErr.message }, { status: 500 });
    }
    bmRowsList = (bmRows ?? []) as Array<{ id: string; meta_bm_id: string }>;
  }
  const bmRowById = new Map(bmRowsList.map((b) => [b.id, b]));

  // Build a unified per-AA descriptor including parent BM text id.
  type AaInfo = {
    uuid: string;
    text_id: string;
    ad_account_name: string | null;
    currency: string | null;
    status: string;
    account_status_code: number | null;
    bm_text_id: string | null;
  };
  const aaInfos: AaInfo[] = [];
  const seen = new Set<string>();
  for (const sel of selectionRows) {
    if (seen.has(sel.meta_ad_account_id)) continue;
    const aa = aaRowById.get(sel.meta_ad_account_id);
    if (!aa) continue;
    const membership = membershipById.get(sel.project_meta_business_manager_id);
    const bmText =
      membership && bmRowById.get(membership.meta_business_manager_id)
        ? bmRowById.get(membership.meta_business_manager_id)!.meta_bm_id
        : null;
    aaInfos.push({
      uuid: aa.id,
      text_id: aa.meta_ad_account_id,
      ad_account_name: aa.ad_account_name,
      currency: aa.currency,
      status: aa.status,
      account_status_code: aa.meta_account_status_code,
      bm_text_id: bmText,
    });
    seen.add(sel.meta_ad_account_id);
  }

  // -------------------- 2. APPLY OPTIONAL FILTERS --------------------
  // ad_account_id overrides bm_id. Both are intersected with the active
  // project scope above — no leakage outside what is selected on this project.
  let scopedAas: AaInfo[];
  if (adAccountIdFilter) {
    scopedAas = aaInfos.filter((a) => a.text_id === adAccountIdFilter);
  } else if (bmIdFilter) {
    scopedAas = aaInfos.filter((a) => a.bm_text_id === bmIdFilter);
  } else {
    scopedAas = aaInfos;
  }

  if (scopedAas.length === 0) {
    return NextResponse.json({
      ok: true,
      dateRange: { since, until },
      lastSyncedAt: null,
      adAccounts: [],
      summary: emptySummary(),
      campaigns: [],
    });
  }

  const scopedAaUuids = scopedAas.map((a) => a.uuid);
  const scopedAaTextIds = scopedAas.map((a) => a.text_id);

  // -------- LAST SYNC TIMESTAMP --------
  // Latest successful sync across the scoped AAs' meta_sync_states rows.
  let lastSyncedAt: string | null = null;
  {
    const { data: syncStateRows, error: ssErr } = await admin
      .from("meta_sync_states")
      .select("last_successful_sync_at")
      .eq("user_id", userId)
      .eq("resource_type", "ad_account")
      .in("resource_id", scopedAaTextIds)
      .not("last_successful_sync_at", "is", null);
    if (!ssErr) {
      for (const r of (syncStateRows ?? []) as Array<{
        last_successful_sync_at: string | null;
      }>) {
        const ts = r.last_successful_sync_at;
        if (!ts) continue;
        if (lastSyncedAt === null || ts > lastSyncedAt) lastSyncedAt = ts;
      }
    }
  }

  // -------------------- 3. SUMMARY (account-level aggregate) --------------------
  const { data: aaInsightRows, error: aaInsErr } = await admin
    .from("meta_ad_account_insights")
    .select("spend, impressions, clicks, purchases, revenue")
    .eq("user_id", userId)
    .in("meta_ad_account_id_fk", scopedAaUuids)
    .gte("date", since)
    .lte("date", until);
  if (aaInsErr) {
    return NextResponse.json({ error: aaInsErr.message }, { status: 500 });
  }

  const sumAgg = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    revenue: 0,
    hasRevenue: false,
  };
  for (const r of (aaInsightRows ?? []) as Array<Record<string, unknown>>) {
    sumAgg.spend += parseNum(r.spend);
    sumAgg.impressions += parseNum(r.impressions);
    sumAgg.clicks += parseNum(r.clicks);
    sumAgg.purchases += parseNum(r.purchases);
    const rev = parseNumOrNull(r.revenue);
    if (rev !== null) {
      sumAgg.revenue += rev;
      sumAgg.hasRevenue = true;
    }
  }
  const summaryRevenue = sumAgg.hasRevenue ? sumAgg.revenue : null;
  const summary: Summary = {
    spend: sumAgg.spend,
    impressions: sumAgg.impressions,
    clicks: sumAgg.clicks,
    purchases: sumAgg.purchases,
    revenue: summaryRevenue,
    ...deriveRates({
      spend: sumAgg.spend,
      impressions: sumAgg.impressions,
      clicks: sumAgg.clicks,
      revenue: summaryRevenue,
    }),
  };

  // -------------------- 4. CAMPAIGNS UNDER SCOPED AAs --------------------
  // Pull every campaign (any DB status) — filter for inclusion in JS so we
  // can apply the "had delivery in window" rule.
  const { data: campaignRows, error: cErr } = await admin
    .from("meta_campaigns")
    .select(
      "id, meta_campaign_id, campaign_name, effective_status, objective, status"
    )
    .eq("user_id", userId)
    .in("meta_ad_account_id", scopedAaUuids)
    .order("campaign_name", { ascending: true });
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const cRows = (campaignRows ?? []) as Array<{
    id: string;
    meta_campaign_id: string;
    campaign_name: string | null;
    effective_status: string | null;
    objective: string | null;
    status: string;
  }>;

  // 4a. Per-campaign delivery aggregate for the window.
  const cAgg = new Map<string, CampaignAgg>();
  if (cRows.length > 0) {
    const campaignTextIds = cRows.map((c) => c.meta_campaign_id);
    const { data: ci, error: ciErr } = await admin
      .from("meta_campaign_insights")
      .select(
        "meta_campaign_id, spend, impressions, clicks, purchases, revenue"
      )
      .eq("user_id", userId)
      .in("meta_campaign_id", campaignTextIds)
      .gte("date", since)
      .lte("date", until);
    if (ciErr) {
      return NextResponse.json({ error: ciErr.message }, { status: 500 });
    }
    for (const r of (ci ?? []) as Array<Record<string, unknown>>) {
      const id = String(r.meta_campaign_id);
      let a = cAgg.get(id);
      if (!a) {
        a = emptyCampaignAgg();
        cAgg.set(id, a);
      }
      a.spend += parseNum(r.spend);
      a.impressions += parseNum(r.impressions);
      a.clicks += parseNum(r.clicks);
      a.purchases += parseNum(r.purchases);
      const rev = parseNumOrNull(r.revenue);
      if (rev !== null) {
        a.revenue += rev;
        a.hasRevenue = true;
      }
    }
  }

  // 4b. Inclusion rule: (status active|paused) OR (had any delivery in window).
  const campaigns = cRows
    .filter((c) => {
      const currentlyActiveOrPaused =
        c.status === "active" || c.status === "paused";
      const agg = cAgg.get(c.meta_campaign_id);
      const hadDelivery =
        agg !== undefined &&
        (agg.spend > 0 ||
          agg.impressions > 0 ||
          agg.clicks > 0 ||
          agg.purchases > 0);
      return currentlyActiveOrPaused || hadDelivery;
    })
    .map((c) => {
      const a = cAgg.get(c.meta_campaign_id) ?? emptyCampaignAgg();
      const revenue = a.hasRevenue ? a.revenue : null;
      const rates = deriveRates({
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        revenue,
      });
      return {
        id: c.id,
        meta_campaign_id: c.meta_campaign_id,
        campaign_name: c.campaign_name,
        effective_status: c.effective_status,
        objective: c.objective,
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        purchases: a.purchases,
        revenue,
        ctr: rates.ctr,
        cpc: rates.cpc,
        cpm: rates.cpm,
        roas: rates.roas,
      };
    });

  return NextResponse.json({
    ok: true,
    dateRange: { since, until },
    lastSyncedAt,
    adAccounts: scopedAas.map((a) => ({
      id: a.uuid,
      meta_ad_account_id: a.text_id,
      ad_account_name: a.ad_account_name,
      currency: a.currency,
      status: a.status,
      account_status_code: a.account_status_code,
    })),
    summary,
    campaigns,
  });
}
