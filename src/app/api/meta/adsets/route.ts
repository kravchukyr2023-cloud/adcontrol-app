import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/meta/adsets?campaign_id=<uuid>&since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Drill-down level 2: ad sets belonging to a single campaign, with
 * window-aggregated insights. Mirrors the data shape of
 * `/api/meta/analytics`'s campaigns array so the UI can render rows
 * with identical formatters.
 *
 * Auth + ownership:
 *   - Session required (401 otherwise).
 *   - `campaign_id` ownership is enforced by an explicit RLS-scoped
 *     SELECT on `meta_campaigns`. RLS already prevents cross-user
 *     reads, but turning a "missing row" into an explicit 403 keeps
 *     the contract symmetric with `/api/projects/summaries` and makes
 *     "I passed someone else's id" diagnosable from logs.
 *
 * Audience: schema has `meta_adsets.targeting jsonb` but no flat
 * `audience` column. A meaningful label needs ~30-field jsonb parsing;
 * deferred. We return `audience: null` and let the UI render an em-dash.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AdsetOut = {
  id: string;
  meta_adset_id: string;
  name: string | null;
  effective_status: string | null;
  audience: string | null;
  spend: number;
  purchases: number;
  revenue: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
};

export async function GET(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaign_id");
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  if (
    !campaignId ||
    !since ||
    !until ||
    !ISO_DATE_RE.test(since) ||
    !ISO_DATE_RE.test(until)
  ) {
    return NextResponse.json(
      { error: "campaign_id, since (YYYY-MM-DD), until (YYYY-MM-DD) required" },
      { status: 400 }
    );
  }

  const sb = await getServerSupabase();

  // Ownership check. RLS would yield zero downstream rows anyway, but
  // a missing campaign here lets us return 403 instead of "[]" so a
  // wrong id is visible in logs.
  const { data: camp, error: campErr } = await sb
    .from("meta_campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (campErr) {
    console.error(`[meta/adsets] campaign lookup: ${campErr.message}`);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!camp) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Adsets list (entity cache).
  const { data: adsetRows, error: adsErr } = await sb
    .from("meta_adsets")
    .select("id, meta_adset_id, adset_name, effective_status")
    .eq("user_id", userId)
    .eq("meta_campaign_id_fk", campaignId);
  if (adsErr) {
    console.error(`[meta/adsets] adsets list: ${adsErr.message}`);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  type AdsetRow = {
    id: string;
    meta_adset_id: string;
    adset_name: string | null;
    effective_status: string | null;
  };
  const adsets = (adsetRows ?? []) as AdsetRow[];
  if (adsets.length === 0) {
    return NextResponse.json({ adsets: [] satisfies AdsetOut[] });
  }

  const adsetUuids = adsets.map((a) => a.id);

  // 2. Aggregate daily insights in the window for these adsets.
  const { data: insightRows, error: insErr } = await sb
    .from("meta_adset_insights")
    .select(
      "meta_adset_id_fk, spend, impressions, clicks, purchases, revenue"
    )
    .eq("user_id", userId)
    .gte("date", since)
    .lte("date", until)
    .in("meta_adset_id_fk", adsetUuids);
  if (insErr) {
    console.error(`[meta/adsets] insights: ${insErr.message}`);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  type Totals = {
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    revenue: number;
    hasRevenue: boolean;
  };
  const perAdsetTotals = new Map<string, Totals>();
  for (const r of (insightRows ?? []) as Array<{
    meta_adset_id_fk: string | null;
    spend: number | string | null;
    impressions: number | string | null;
    clicks: number | string | null;
    purchases: number | null;
    revenue: number | string | null;
  }>) {
    const id = r.meta_adset_id_fk;
    if (!id) continue;
    const t =
      perAdsetTotals.get(id) ??
      ({
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        revenue: 0,
        hasRevenue: false,
      } as Totals);
    t.spend += Number(r.spend ?? 0);
    t.impressions += Number(r.impressions ?? 0);
    t.clicks += Number(r.clicks ?? 0);
    t.purchases += Number(r.purchases ?? 0);
    // Preserve null vs 0 for revenue: a row with `null` (priority chain
    // never found a value) must NOT bump hasRevenue. Treats the summed
    // revenue as null until at least one daily row carried a number.
    if (r.revenue !== null && r.revenue !== undefined) {
      t.revenue += Number(r.revenue);
      t.hasRevenue = true;
    }
    perAdsetTotals.set(id, t);
  }

  const out: AdsetOut[] = adsets
    .map((a) => {
      const t = perAdsetTotals.get(a.id) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        revenue: 0,
        hasRevenue: false,
      };
      const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
      const cpc = t.clicks > 0 ? t.spend / t.clicks : null;
      const cpm =
        t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null;
      const cpa = t.purchases > 0 ? t.spend / t.purchases : null;
      const revenue = t.hasRevenue ? t.revenue : null;
      const roas =
        revenue !== null && t.spend > 0 ? revenue / t.spend : null;
      return {
        id: a.id,
        meta_adset_id: a.meta_adset_id,
        name: a.adset_name,
        effective_status: a.effective_status,
        audience: null,
        spend: t.spend,
        purchases: t.purchases,
        revenue,
        impressions: t.impressions,
        clicks: t.clicks,
        ctr,
        cpc,
        cpm,
        cpa,
        roas,
      };
    })
    // Largest spend first — matches the visual hierarchy on /meta.
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({ adsets: out });
}
