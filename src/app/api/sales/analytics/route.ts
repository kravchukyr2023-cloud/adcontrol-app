import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";
import { isMissingEnvError } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/sales/analytics
 *   ?project_id=<uuid>                       (required)
 *   [&since=YYYY-MM-DD&until=YYYY-MM-DD]     (optional date overrides)
 *
 * Reads `orders` (populated by Stage 19 Google Sheets sync + attributed by
 * Stage 21) and returns three rollups consumed by /sales:
 *
 *   - summary:       page-level KPI cards (Revenue / Orders / AOV /
 *                    matched vs unmatched counts).
 *   - perCampaign:   map keyed by meta_campaigns.id (uuid) so the
 *                    Meta-vs-Real campaign table can splat REAL columns by
 *                    joining on the campaign id already present in the
 *                    Meta analytics response.
 *   - recentOrders:  the last 50 orders (date desc) with matched Meta
 *                    entity names pre-resolved for the bottom-of-page table.
 *
 * Per the platform philosophy doc, revenue is assumed to be in the same
 * currency as the Meta ad account — we therefore aggregate numerically
 * without locale conversion. Callers display the result in the cabinet's
 * currency.
 *
 * Aggregation is done in Node (a single SELECT pulls all rows in window).
 * Rows-in-window cap keeps the route fast even if a user uploads tens of
 * thousands of orders; the response carries a `truncated` flag.
 */

const MAX_AGGREGATE_ROWS = 5000;
const RECENT_LIMIT = 50;

type Body = {
  project_id?: string;
  since?: string;
  until?: string;
};

type OrderAggregateRow = {
  revenue: number | string;
  attribution_status: string;
  matched_meta_campaign_id: string | null;
  currency: string;
};

type OrderListRow = {
  id: string;
  order_date: string;
  customer_name: string | null;
  customer_email: string | null;
  product_name: string | null;
  revenue: number | string;
  currency: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  attribution_status: string;
  matched_meta_campaign_id: string | null;
  matched_meta_adset_id: string | null;
  matched_meta_ad_id: string | null;
  sales_source_id: string | null;
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

function pickIso(raw: string | null, fallback: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params: Body = {
      project_id: req.nextUrl.searchParams.get("project_id") ?? undefined,
      since: req.nextUrl.searchParams.get("since") ?? undefined,
      until: req.nextUrl.searchParams.get("until") ?? undefined,
    };

    if (!params.project_id) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    const sb = await getServerSupabase();

    // Ownership check — RLS already restricts by user, but explicit
    // .eq("user_id") guards against future RLS bypass via a mis-configured
    // admin client (matches the pattern in /api/meta/analytics).
    const { data: project, error: projErr } = await sb
      .from("projects")
      .select("id, currency")
      .eq("id", params.project_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (projErr) {
      console.error(`[sales/analytics] project lookup: ${projErr.message}`);
      return NextResponse.json(
        { error: "DB error loading project" },
        { status: 500 }
      );
    }
    if (!project) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const defaultRange = monthToDate();
    const since = pickIso(params.since ?? null, defaultRange.since);
    const until = pickIso(params.until ?? null, defaultRange.until);

    // -----------------------------------------------------------------
    // 1. Aggregate query: all orders in window.
    // -----------------------------------------------------------------
    const { data: aggregateRows, error: aggErr } = await sb
      .from("orders")
      .select(
        "revenue, attribution_status, matched_meta_campaign_id, currency"
      )
      .eq("user_id", userId)
      .eq("project_id", params.project_id)
      .gte("order_date", since)
      .lte("order_date", until)
      .limit(MAX_AGGREGATE_ROWS + 1);

    if (aggErr) {
      console.error(`[sales/analytics] orders aggregate: ${aggErr.message}`);
      return NextResponse.json(
        { error: "DB error loading orders" },
        { status: 500 }
      );
    }

    const allAggregateRows = (aggregateRows ?? []) as OrderAggregateRow[];
    const truncated = allAggregateRows.length > MAX_AGGREGATE_ROWS;
    const rows = truncated
      ? allAggregateRows.slice(0, MAX_AGGREGATE_ROWS)
      : allAggregateRows;

    let totalRevenue = 0;
    let matchedOrders = 0;
    let unmatchedOrders = 0;
    let manualOrders = 0;

    const perCampaign = new Map<
      string,
      { revenue: number; orders: number }
    >();
    const currencyCounts = new Map<string, number>();

    for (const row of rows) {
      const rev = parseNum(row.revenue);
      totalRevenue += rev;

      if (row.attribution_status === "matched") matchedOrders += 1;
      else if (row.attribution_status === "manual") manualOrders += 1;
      else unmatchedOrders += 1; // 'unmatched' or 'partial'

      if (row.matched_meta_campaign_id) {
        const bucket = perCampaign.get(row.matched_meta_campaign_id) ?? {
          revenue: 0,
          orders: 0,
        };
        bucket.revenue += rev;
        bucket.orders += 1;
        perCampaign.set(row.matched_meta_campaign_id, bucket);
      }

      if (row.currency) {
        currencyCounts.set(
          row.currency,
          (currencyCounts.get(row.currency) ?? 0) + 1
        );
      }
    }

    const totalOrders = rows.length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : null;

    let dominantCurrency: string | null = null;
    let bestCount = 0;
    for (const [cur, count] of currencyCounts) {
      if (count > bestCount) {
        bestCount = count;
        dominantCurrency = cur;
      }
    }

    // -----------------------------------------------------------------
    // 2. Recent orders (last 50 by date desc) — separate query so we can
    //    ORDER BY without dragging it through the aggregate path. Reuses
    //    the same window.
    // -----------------------------------------------------------------
    const { data: recentRows, error: recentErr } = await sb
      .from("orders")
      .select(
        "id, order_date, customer_name, customer_email, product_name, revenue, currency, utm_source, utm_medium, utm_campaign, attribution_status, matched_meta_campaign_id, matched_meta_adset_id, matched_meta_ad_id, sales_source_id"
      )
      .eq("user_id", userId)
      .eq("project_id", params.project_id)
      .gte("order_date", since)
      .lte("order_date", until)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);

    if (recentErr) {
      console.error(`[sales/analytics] recent orders: ${recentErr.message}`);
      return NextResponse.json(
        { error: "DB error loading recent orders" },
        { status: 500 }
      );
    }

    const recents = (recentRows ?? []) as OrderListRow[];

    // -----------------------------------------------------------------
    // 3. Resolve matched entity names for the recent-orders rows.
    //    Three small IN-queries are faster than 50× FK-joined selects.
    // -----------------------------------------------------------------
    const campaignIds = Array.from(
      new Set(
        recents
          .map((r) => r.matched_meta_campaign_id)
          .filter((v): v is string => !!v)
      )
    );
    const adsetIds = Array.from(
      new Set(
        recents
          .map((r) => r.matched_meta_adset_id)
          .filter((v): v is string => !!v)
      )
    );
    const adIds = Array.from(
      new Set(
        recents
          .map((r) => r.matched_meta_ad_id)
          .filter((v): v is string => !!v)
      )
    );
    // Resolve source_type per order via a single IN on sales_sources.
    // We avoid a PostgREST embed here because many-to-one returns either an
    // object or null and the type narrowing is awkward across the rest of
    // the OrderListRow shape — one explicit lookup keeps the schema literal.
    const sourceIds = Array.from(
      new Set(
        recents
          .map((r) => r.sales_source_id)
          .filter((v): v is string => !!v)
      )
    );

    const [campaignNames, adsetNames, adNames, sourceTypes] = await Promise.all([
      campaignIds.length > 0
        ? sb
            .from("meta_campaigns")
            .select("id, campaign_name")
            .in("id", campaignIds)
        : Promise.resolve({ data: [], error: null }),
      adsetIds.length > 0
        ? sb
            .from("meta_adsets")
            .select("id, adset_name")
            .in("id", adsetIds)
        : Promise.resolve({ data: [], error: null }),
      adIds.length > 0
        ? sb.from("meta_ads").select("id, ad_name").in("id", adIds)
        : Promise.resolve({ data: [], error: null }),
      sourceIds.length > 0
        ? sb
            .from("sales_sources")
            .select("id, source_type")
            .in("id", sourceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const campaignNameById = new Map<string, string>();
    for (const r of (campaignNames.data ?? []) as Array<{
      id: string;
      campaign_name: string | null;
    }>) {
      if (r.campaign_name) campaignNameById.set(r.id, r.campaign_name);
    }
    const adsetNameById = new Map<string, string>();
    for (const r of (adsetNames.data ?? []) as Array<{
      id: string;
      adset_name: string | null;
    }>) {
      if (r.adset_name) adsetNameById.set(r.id, r.adset_name);
    }
    const adNameById = new Map<string, string>();
    for (const r of (adNames.data ?? []) as Array<{
      id: string;
      ad_name: string | null;
    }>) {
      if (r.ad_name) adNameById.set(r.id, r.ad_name);
    }
    const sourceTypeById = new Map<string, string>();
    for (const r of (sourceTypes.data ?? []) as Array<{
      id: string;
      source_type: string | null;
    }>) {
      if (r.source_type) sourceTypeById.set(r.id, r.source_type);
    }

    const recentOrders = recents.map((r) => ({
      id: r.id,
      order_date: r.order_date,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      product_name: r.product_name,
      revenue: parseNum(r.revenue),
      currency: r.currency,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      attribution_status: r.attribution_status,
      matched_campaign_name: r.matched_meta_campaign_id
        ? campaignNameById.get(r.matched_meta_campaign_id) ?? null
        : null,
      matched_adset_name: r.matched_meta_adset_id
        ? adsetNameById.get(r.matched_meta_adset_id) ?? null
        : null,
      matched_ad_name: r.matched_meta_ad_id
        ? adNameById.get(r.matched_meta_ad_id) ?? null
        : null,
      // Orders with no sales_source_id come from the manual-orders form
      // (Sprint 4, Stage 16). Surface them as "manual" so the UI doesn't
      // need a separate null/manual branch.
      source_type: r.sales_source_id
        ? sourceTypeById.get(r.sales_source_id) ?? null
        : "manual",
    }));

    const perCampaignObj: Record<
      string,
      { revenue: number; orders: number }
    > = {};
    for (const [id, agg] of perCampaign) {
      perCampaignObj[id] = agg;
    }

    return NextResponse.json({
      dateRange: { since, until },
      summary: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        aov,
        matched_orders: matchedOrders,
        manual_orders: manualOrders,
        unmatched_orders: unmatchedOrders,
        currency: dominantCurrency ?? project.currency ?? null,
        truncated,
      },
      perCampaign: perCampaignObj,
      recentOrders,
    });
  } catch (err) {
    if (isMissingEnvError(err)) {
      console.error(`[sales/analytics] ${err.message}`);
      return NextResponse.json(
        { error: "Server misconfiguration", detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[sales/analytics] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
