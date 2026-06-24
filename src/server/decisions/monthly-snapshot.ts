import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import type {
  AdAccountRollup,
  AttributionAggregate,
  EntityLevel,
  EntityPerformance,
  MonthlySnapshot,
  PlanContext,
  SnapshotTotals,
} from "@/server/decisions/types";

/**
 * Sprint 6 Stage 29: assembles the MonthlySnapshot.
 *
 * Period is always the current calendar month UTC (1st → today inclusive).
 * No N+1: ~10 flat queries, all aggregation in Node.
 *
 * Inclusion rule for entities: a campaign / adset / ad is included if it has
 * ≥ 1 insight row in the month, even if it is currently paused / archived.
 * This matches the "брат який бачить весь місяць" spec — paused-late-in-month
 * campaigns must still influence the analysis.
 *
 * Uses the service-role client because the route handler does the ownership
 * check up-front (mirrors syncShopifySource / syncGoogleSheetsSource).
 *
 * Data-completeness is honest. On Hobby, the Meta cron throttles ad-level
 * inserts and the ratio of ads-with-insights / total-ads can be low. The
 * builder surfaces this verbatim in dataCompleteness.note instead of hiding
 * sparse data — the logic is the final logic; completeness is the dial.
 */

export async function buildMonthlySnapshot(params: {
  userId: string;
  projectId: string;
}): Promise<MonthlySnapshot> {
  const { userId, projectId } = params;
  const admin = getAdminSupabase();

  // ---------- 1. Project + plan ----------
  const { since, until } = thisMonthRangeUtc();

  const { data: projectRow, error: projErr } = await admin
    .from("projects")
    .select(
      "id, name, currency, target_roas, target_cpa, monthly_revenue_goal, monthly_ad_budget"
    )
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projErr) {
    throw new Error(`projects lookup failed: ${projErr.message}`);
  }
  if (!projectRow) {
    throw new Error("Project not found or not owned by user");
  }

  const project = projectRow as {
    id: string;
    name: string;
    currency: string | null;
    target_roas: number | string | null;
    target_cpa: number | string | null;
    monthly_revenue_goal: number | string | null;
    monthly_ad_budget: number | string | null;
  };

  const finalPlan: PlanContext = buildPlanContext({
    monthStart: since,
    monthEnd: until,
    targetRevenue: num(project.monthly_revenue_goal),
    targetSpend: num(project.monthly_ad_budget),
    targetRoas: num(project.target_roas),
    targetCpa: num(project.target_cpa),
  });

  // ---------- 2. Project → ad account bindings ----------
  const aaUuids = await loadActiveProjectAaUuids(admin, userId, projectId);

  // No live AAs → return an empty snapshot (still a valid struct).
  if (aaUuids.length === 0) {
    return emptySnapshot({
      projectId,
      projectName: project.name,
      currency: project.currency ?? "USD",
      plan: finalPlan,
    });
  }

  // ---------- 3. AA names + campaign / adset / ad entities (parallel) ----------
  const [aaNamesResp, campaignsResp] = await Promise.all([
    admin
      .from("meta_ad_accounts")
      .select("id, ad_account_name")
      .in("id", aaUuids),
    admin
      .from("meta_campaigns")
      .select(
        "id, campaign_name, effective_status, status, meta_ad_account_id"
      )
      .in("meta_ad_account_id", aaUuids),
  ]);

  if (aaNamesResp.error) {
    throw new Error(
      `meta_ad_accounts lookup failed: ${aaNamesResp.error.message}`
    );
  }
  if (campaignsResp.error) {
    throw new Error(`meta_campaigns lookup failed: ${campaignsResp.error.message}`);
  }

  type AaRow = { id: string; ad_account_name: string | null };
  type CampaignRow = {
    id: string;
    campaign_name: string | null;
    effective_status: string | null;
    status: string | null;
    meta_ad_account_id: string | null;
  };

  const aaNameById = new Map<string, string>();
  for (const r of (aaNamesResp.data ?? []) as AaRow[]) {
    aaNameById.set(r.id, r.ad_account_name ?? "Untitled ad account");
  }

  const campaigns = (campaignsResp.data ?? []) as CampaignRow[];
  const campaignIds = campaigns.map((c) => c.id);
  const campaignById = new Map<string, CampaignRow>();
  for (const c of campaigns) campaignById.set(c.id, c);

  // Even if there are no campaigns yet, we still want a (mostly-empty) AA
  // rollup. So skip child queries when campaignIds is empty.
  let adsets: AdsetRow[] = [];
  let adsetIds: string[] = [];
  let campaignInsights: CampaignInsightRow[] = [];
  let aaInsights: AaInsightRow[] = [];
  let orderRows: OrderRow[] = [];

  if (campaignIds.length > 0) {
    const [adsetsResp, campaignInsightsResp, aaInsightsResp, ordersResp] =
      await Promise.all([
        admin
          .from("meta_adsets")
          .select(
            "id, adset_name, effective_status, status, meta_campaign_id_fk"
          )
          .in("meta_campaign_id_fk", campaignIds),
        admin
          .from("meta_campaign_insights")
          .select(
            "meta_campaign_id_fk, spend, impressions, clicks, purchases, revenue"
          )
          .gte("date", since)
          .lte("date", until)
          .in("meta_campaign_id_fk", campaignIds),
        loadAaInsights(admin, userId, aaUuids, since, until),
        loadOrderRows(admin, userId, projectId, since, until),
      ]);

    if (adsetsResp.error) {
      throw new Error(`meta_adsets lookup failed: ${adsetsResp.error.message}`);
    }
    if (campaignInsightsResp.error) {
      throw new Error(
        `meta_campaign_insights lookup failed: ${campaignInsightsResp.error.message}`
      );
    }

    adsets = (adsetsResp.data ?? []) as AdsetRow[];
    adsetIds = adsets.map((a) => a.id);
    campaignInsights =
      (campaignInsightsResp.data ?? []) as CampaignInsightRow[];
    aaInsights = aaInsightsResp;
    orderRows = ordersResp;
  } else {
    // No campaigns under any of the project's AAs — still pull AA-level
    // insights + orders so totals reflect what little Meta has, and the
    // snapshot has a stable shape.
    const [aaInsightsResp, ordersResp] = await Promise.all([
      loadAaInsights(admin, userId, aaUuids, since, until),
      loadOrderRows(admin, userId, projectId, since, until),
    ]);
    aaInsights = aaInsightsResp;
    orderRows = ordersResp;
  }

  const adsetById = new Map<string, AdsetRow>();
  for (const a of adsets) adsetById.set(a.id, a);

  // ---------- 4. Ad entities + adset/ad insights (parallel) ----------
  let ads: AdRow[] = [];
  let adsetInsights: AdsetInsightRow[] = [];

  if (adsetIds.length > 0) {
    const [adsResp, adsetInsightsResp] = await Promise.all([
      admin
        .from("meta_ads")
        .select(
          "id, ad_name, effective_status, status, meta_adset_id_fk"
        )
        .in("meta_adset_id_fk", adsetIds),
      admin
        .from("meta_adset_insights")
        .select(
          "meta_adset_id_fk, spend, impressions, clicks, purchases, revenue"
        )
        .gte("date", since)
        .lte("date", until)
        .in("meta_adset_id_fk", adsetIds),
    ]);

    if (adsResp.error) {
      throw new Error(`meta_ads lookup failed: ${adsResp.error.message}`);
    }
    if (adsetInsightsResp.error) {
      throw new Error(
        `meta_adset_insights lookup failed: ${adsetInsightsResp.error.message}`
      );
    }

    ads = (adsResp.data ?? []) as AdRow[];
    adsetInsights = (adsetInsightsResp.data ?? []) as AdsetInsightRow[];
  }

  const adById = new Map<string, AdRow>();
  for (const a of ads) adById.set(a.id, a);

  // ---------- 5. Ad-level insights ----------
  let adInsights: AdInsightRow[] = [];
  if (ads.length > 0) {
    const adIds = ads.map((a) => a.id);
    const { data, error } = await admin
      .from("meta_ad_insights")
      .select(
        "meta_ad_id_fk, spend, impressions, clicks, purchases, revenue"
      )
      .gte("date", since)
      .lte("date", until)
      .in("meta_ad_id_fk", adIds);
    if (error) {
      throw new Error(`meta_ad_insights lookup failed: ${error.message}`);
    }
    adInsights = (data ?? []) as AdInsightRow[];
  }

  // ---------- 6. Bucket insights per FK ----------
  const aaInsightAgg = aggregateInsights(
    aaInsights.map((r) => ({ fk: r.meta_ad_account_id_fk, ...r }))
  );
  const campaignInsightAgg = aggregateInsights(
    campaignInsights.map((r) => ({ fk: r.meta_campaign_id_fk, ...r }))
  );
  const adsetInsightAgg = aggregateInsights(
    adsetInsights.map((r) => ({ fk: r.meta_adset_id_fk, ...r }))
  );
  const adInsightAgg = aggregateInsights(
    adInsights.map((r) => ({ fk: r.meta_ad_id_fk, ...r }))
  );

  // ---------- 7. Bucket orders per matched entity ----------
  const ordersByCampaign = new Map<string, OrderBucket>();
  const ordersByAdset = new Map<string, OrderBucket>();
  const ordersByAd = new Map<string, OrderBucket>();
  let totalRealRevenue = 0;
  let totalRealOrders = 0;

  for (const o of orderRows) {
    const rev = num(o.revenue);
    if (!Number.isFinite(rev)) continue;
    totalRealRevenue += rev;
    totalRealOrders += 1;
    const status = (o.attribution_status ?? "unmatched") as keyof AttributionAggregate;
    if (o.matched_meta_campaign_id) {
      addOrder(ordersByCampaign, o.matched_meta_campaign_id, rev, status);
    }
    if (o.matched_meta_adset_id) {
      addOrder(ordersByAdset, o.matched_meta_adset_id, rev, status);
    }
    if (o.matched_meta_ad_id) {
      addOrder(ordersByAd, o.matched_meta_ad_id, rev, status);
    }
  }

  // ---------- 8. Build EntityPerformance arrays ----------
  // Inclusion rule: entity must have ≥ 1 insight row in the month.
  const campaignsOut: EntityPerformance[] = [];
  for (const campaignId of campaignInsightAgg.keys()) {
    const c = campaignById.get(campaignId);
    if (!c) continue;
    const aaId = c.meta_ad_account_id ?? "";
    campaignsOut.push(
      buildEntity({
        id: campaignId,
        name: c.campaign_name ?? "Untitled campaign",
        level: "campaign",
        adAccountId: aaId,
        adAccountName: aaNameById.get(aaId) ?? "Untitled ad account",
        effectiveStatus: c.effective_status,
        insights: campaignInsightAgg.get(campaignId),
        orders: ordersByCampaign.get(campaignId),
        parentCampaignId: null,
        parentAdsetId: null,
      })
    );
  }

  const adsetsOut: EntityPerformance[] = [];
  for (const adsetId of adsetInsightAgg.keys()) {
    const ad = adsetById.get(adsetId);
    if (!ad) continue;
    const campaign = ad.meta_campaign_id_fk
      ? campaignById.get(ad.meta_campaign_id_fk)
      : null;
    const aaId = campaign?.meta_ad_account_id ?? "";
    adsetsOut.push(
      buildEntity({
        id: adsetId,
        name: ad.adset_name ?? "Untitled adset",
        level: "adset",
        adAccountId: aaId,
        adAccountName: aaNameById.get(aaId) ?? "Untitled ad account",
        effectiveStatus: ad.effective_status,
        insights: adsetInsightAgg.get(adsetId),
        orders: ordersByAdset.get(adsetId),
        parentCampaignId: ad.meta_campaign_id_fk,
        parentAdsetId: null,
      })
    );
  }

  const adsOut: EntityPerformance[] = [];
  for (const adId of adInsightAgg.keys()) {
    const ad = adById.get(adId);
    if (!ad) continue;
    const adset = ad.meta_adset_id_fk
      ? adsetById.get(ad.meta_adset_id_fk)
      : null;
    const campaign = adset?.meta_campaign_id_fk
      ? campaignById.get(adset.meta_campaign_id_fk)
      : null;
    const aaId = campaign?.meta_ad_account_id ?? "";
    adsOut.push(
      buildEntity({
        id: adId,
        name: ad.ad_name ?? "Untitled ad",
        level: "ad",
        adAccountId: aaId,
        adAccountName: aaNameById.get(aaId) ?? "Untitled ad account",
        effectiveStatus: ad.effective_status,
        insights: adInsightAgg.get(adId),
        orders: ordersByAd.get(adId),
        parentCampaignId: campaign?.id ?? null,
        parentAdsetId: adset?.id ?? null,
      })
    );
  }

  // ---------- 9. Totals + per-AA rollup ----------
  // Totals: spend / metaRevenue / purchases come from AA insights (the most
  // accurate aggregate Meta gives us). realRevenue / realOrders come from
  // orders directly — they count even when matched_meta_* is null, because
  // the project earned that money regardless of which campaign Meta thinks
  // it belongs to.
  let totalSpend = 0;
  let totalMetaRevenue = 0;
  let totalPurchases = 0;
  const adAccounts: AdAccountRollup[] = [];
  for (const aaId of aaUuids) {
    const agg = aaInsightAgg.get(aaId);
    const spend = agg?.spend ?? 0;
    const metaRevenue = agg?.revenue ?? 0;
    totalSpend += spend;
    totalMetaRevenue += metaRevenue;
    totalPurchases += agg?.purchases ?? 0;
    // Per-AA real revenue: sum of matched-campaign orders where the
    // campaign belongs to this AA. Unmatched orders don't get attributed
    // to a specific AA.
    let aaRealRevenue = 0;
    for (const c of campaigns) {
      if (c.meta_ad_account_id !== aaId) continue;
      const bucket = ordersByCampaign.get(c.id);
      if (bucket) aaRealRevenue += bucket.revenue;
    }
    adAccounts.push({
      id: aaId,
      name: aaNameById.get(aaId) ?? "Untitled ad account",
      spend,
      realRevenue: aaRealRevenue,
      metaRevenue,
      realRoas: spend > 0 ? aaRealRevenue / spend : null,
    });
  }

  const totals: SnapshotTotals = {
    spend: totalSpend,
    realRevenue: totalRealRevenue,
    realOrders: totalRealOrders,
    realRoas: totalSpend > 0 ? totalRealRevenue / totalSpend : null,
    metaRevenue: totalMetaRevenue,
    purchases: totalPurchases,
  };

  // ---------- 10. dataCompleteness ----------
  const totalAds = ads.length;
  const adsWithInsights = adInsightAgg.size;
  const coverage =
    totalAds === 0 ? 1 : adsWithInsights / totalAds;
  const completenessNote = buildCompletenessNote(coverage, totalAds);

  return {
    projectId,
    projectName: project.name,
    currency: project.currency ?? "USD",
    plan: finalPlan,
    totals,
    adAccounts,
    campaigns: campaignsOut,
    adsets: adsetsOut,
    ads: adsOut,
    dataCompleteness: {
      adInsightsCoverage: coverage,
      totalAds,
      adsWithInsights,
      note: completenessNote,
    },
    computedAt: new Date().toISOString(),
  };
}

// ===========================================================================
// Helpers — kept local so the snapshot builder reads top-to-bottom.
// ===========================================================================

function thisMonthRangeUtc(): { since: string; until: string } {
  const now = new Date();
  const sinceD = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const todayD = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { since: iso(sinceD), until: iso(todayD) };
}

function buildPlanContext(args: {
  monthStart: string;
  monthEnd: string;
  targetRevenue: number;
  targetSpend: number;
  targetRoas: number;
  targetCpa: number;
}): PlanContext {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const fraction = dayOfMonth / daysInMonth;
  const proRate = (target: number) => (target > 0 ? target * fraction : 0);
  return {
    targetRevenue: args.targetRevenue,
    targetSpend: args.targetSpend,
    targetRoas: args.targetRoas,
    targetCpa: args.targetCpa,
    daysInMonth,
    dayOfMonth,
    proRatedTargetRevenue: proRate(args.targetRevenue),
    proRatedTargetSpend: proRate(args.targetSpend),
    monthStart: args.monthStart,
    monthEnd: args.monthEnd,
  };
}

async function loadActiveProjectAaUuids(
  admin: ReturnType<typeof getAdminSupabase>,
  userId: string,
  projectId: string
): Promise<string[]> {
  // Same chain-active filter the /api/projects/summaries route uses:
  // selection → BM membership → connection all need status='active'.
  const { data, error } = await admin
    .from("project_meta_ad_accounts")
    .select(
      "meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active");

  if (error) throw new Error(`bindings lookup failed: ${error.message}`);

  type BindingRow = {
    meta_ad_account_id: string | null;
    project_meta_business_managers: {
      status: string | null;
      meta_connections: { status: string | null } | null;
    } | null;
  };

  const out = new Set<string>();
  for (const b of (data ?? []) as unknown as BindingRow[]) {
    const bm = b.project_meta_business_managers;
    const conn = bm?.meta_connections;
    if (bm?.status !== "active" || conn?.status !== "active") continue;
    if (b.meta_ad_account_id) out.add(b.meta_ad_account_id);
  }
  return Array.from(out);
}

type AaInsightRow = {
  meta_ad_account_id_fk: string | null;
  spend: number | string | null;
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  revenue: number | string | null;
};

async function loadAaInsights(
  admin: ReturnType<typeof getAdminSupabase>,
  userId: string,
  aaUuids: string[],
  since: string,
  until: string
): Promise<AaInsightRow[]> {
  const { data, error } = await admin
    .from("meta_ad_account_insights")
    .select(
      "meta_ad_account_id_fk, spend, impressions, clicks, purchases, revenue"
    )
    .eq("user_id", userId)
    .gte("date", since)
    .lte("date", until)
    .in("meta_ad_account_id_fk", aaUuids);
  if (error) {
    throw new Error(`meta_ad_account_insights lookup failed: ${error.message}`);
  }
  return (data ?? []) as AaInsightRow[];
}

type OrderRow = {
  revenue: number | string | null;
  matched_meta_campaign_id: string | null;
  matched_meta_adset_id: string | null;
  matched_meta_ad_id: string | null;
  attribution_status: string | null;
};

async function loadOrderRows(
  admin: ReturnType<typeof getAdminSupabase>,
  userId: string,
  projectId: string,
  since: string,
  until: string
): Promise<OrderRow[]> {
  const { data, error } = await admin
    .from("orders")
    .select(
      "revenue, matched_meta_campaign_id, matched_meta_adset_id, matched_meta_ad_id, attribution_status"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);
  if (error) throw new Error(`orders lookup failed: ${error.message}`);
  return (data ?? []) as OrderRow[];
}

type AdsetRow = {
  id: string;
  adset_name: string | null;
  effective_status: string | null;
  status: string | null;
  meta_campaign_id_fk: string | null;
};
type AdRow = {
  id: string;
  ad_name: string | null;
  effective_status: string | null;
  status: string | null;
  meta_adset_id_fk: string | null;
};
type CampaignInsightRow = {
  meta_campaign_id_fk: string | null;
  spend: number | string | null;
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  revenue: number | string | null;
};
type AdsetInsightRow = {
  meta_adset_id_fk: string | null;
  spend: number | string | null;
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  revenue: number | string | null;
};
type AdInsightRow = {
  meta_ad_id_fk: string | null;
  spend: number | string | null;
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  revenue: number | string | null;
};

type InsightAgg = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
};

function aggregateInsights(
  rows: Array<{
    fk: string | null;
    spend: number | string | null;
    impressions: number | null;
    clicks: number | null;
    purchases: number | null;
    revenue: number | string | null;
  }>
): Map<string, InsightAgg> {
  const out = new Map<string, InsightAgg>();
  for (const r of rows) {
    if (!r.fk) continue;
    const agg = out.get(r.fk) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      revenue: 0,
    };
    agg.spend += num(r.spend);
    agg.impressions += num(r.impressions);
    agg.clicks += num(r.clicks);
    agg.purchases += num(r.purchases);
    agg.revenue += num(r.revenue);
    out.set(r.fk, agg);
  }
  return out;
}

type OrderBucket = {
  revenue: number;
  orders: number;
  attribution: AttributionAggregate;
};

function addOrder(
  map: Map<string, OrderBucket>,
  id: string,
  revenue: number,
  status: keyof AttributionAggregate
) {
  const bucket =
    map.get(id) ??
    ({
      revenue: 0,
      orders: 0,
      attribution: { matched: 0, partial: 0, unmatched: 0, manual: 0 },
    } as OrderBucket);
  bucket.revenue += revenue;
  bucket.orders += 1;
  if (status in bucket.attribution) {
    bucket.attribution[status] += 1;
  } else {
    bucket.attribution.unmatched += 1;
  }
  map.set(id, bucket);
}

function buildEntity(args: {
  id: string;
  name: string;
  level: EntityLevel;
  adAccountId: string;
  adAccountName: string;
  effectiveStatus: string | null;
  insights: InsightAgg | undefined;
  orders: OrderBucket | undefined;
  parentCampaignId: string | null;
  parentAdsetId: string | null;
}): EntityPerformance {
  const ins = args.insights ?? {
    spend: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    revenue: 0,
  };
  const ord = args.orders;
  const realRevenue = ord?.revenue ?? 0;
  const realOrders = ord?.orders ?? 0;
  return {
    id: args.id,
    name: args.name,
    level: args.level,
    adAccountId: args.adAccountId,
    adAccountName: args.adAccountName,
    isActive: args.effectiveStatus === "ACTIVE",
    effectiveStatus: args.effectiveStatus,
    spend: ins.spend,
    impressions: ins.impressions,
    clicks: ins.clicks,
    purchases: ins.purchases,
    metaRevenue: ins.revenue,
    metaRoas: ins.spend > 0 ? ins.revenue / ins.spend : null,
    realRevenue,
    realOrders,
    realRoas: ins.spend > 0 ? realRevenue / ins.spend : null,
    realCpa: realOrders > 0 ? ins.spend / realOrders : null,
    attribution: ord?.attribution ?? {
      matched: 0,
      partial: 0,
      unmatched: 0,
      manual: 0,
    },
    parentCampaignId: args.parentCampaignId,
    parentAdsetId: args.parentAdsetId,
  };
}

function buildCompletenessNote(coverage: number, totalAds: number): string {
  if (totalAds === 0) {
    return "No ads in scope for this project yet.";
  }
  if (coverage >= 0.9) {
    return `${Math.round(coverage * 100)}% of ads have month-to-date insights.`;
  }
  if (coverage >= 0.5) {
    return `Only ${Math.round(
      coverage * 100
    )}% of ads have month-to-date insights — ad-level analysis may be partial. (Hobby cron throttles ad-level inserts; full coverage requires Vercel Pro.)`;
  }
  return `Only ${Math.round(
    coverage * 100
  )}% of ads have month-to-date insights — ad-level analysis is sparse and should not be relied on alone. Campaign- and adset-level numbers remain accurate. (Hobby cron throttling.)`;
}

function emptySnapshot(args: {
  projectId: string;
  projectName: string;
  currency: string;
  plan: PlanContext;
}): MonthlySnapshot {
  return {
    projectId: args.projectId,
    projectName: args.projectName,
    currency: args.currency,
    plan: args.plan,
    totals: {
      spend: 0,
      realRevenue: 0,
      realOrders: 0,
      realRoas: null,
      metaRevenue: 0,
      purchases: 0,
    },
    adAccounts: [],
    campaigns: [],
    adsets: [],
    ads: [],
    dataCompleteness: {
      adInsightsCoverage: 1,
      totalAds: 0,
      adsWithInsights: 0,
      note: "No active ad accounts wired to this project.",
    },
    computedAt: new Date().toISOString(),
  };
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
