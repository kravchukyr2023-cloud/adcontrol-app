import { NextRequest, NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/meta/ads?adset_id=<uuid>&since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Drill-down level 3: ads belonging to a single ad set, with window-
 * aggregated insights. Same auth + ownership contract as the adsets
 * route — see that file for the rationale.
 *
 * Schema gaps:
 *   - `creative_type` ("video"/"static"/"ugc"/…) — NOT in schema.
 *     Derivable from Meta's `adcreative.object_story_spec`, which is
 *     not synced yet. We return `null` here; UI renders an "Other"
 *     badge.
 *   - `utm` — NOT in schema. Lives in
 *     `adcreative.object_story_spec.link_data.url_tags`; same blocker.
 *     Returns null → UI renders em-dash.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AdOut = {
  id: string;
  meta_ad_id: string;
  name: string | null;
  effective_status: string | null;
  creative_type: string | null;
  utm: string | null;
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
  const adsetId = searchParams.get("adset_id");
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  if (
    !adsetId ||
    !since ||
    !until ||
    !ISO_DATE_RE.test(since) ||
    !ISO_DATE_RE.test(until)
  ) {
    return NextResponse.json(
      { error: "adset_id, since (YYYY-MM-DD), until (YYYY-MM-DD) required" },
      { status: 400 }
    );
  }

  const sb = await getServerSupabase();

  const { data: adset, error: adsErr } = await sb
    .from("meta_adsets")
    .select("id")
    .eq("id", adsetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (adsErr) {
    console.error(`[meta/ads] adset lookup: ${adsErr.message}`);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!adset) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: adRows, error: adsListErr } = await sb
    .from("meta_ads")
    .select("id, meta_ad_id, ad_name, effective_status")
    .eq("user_id", userId)
    .eq("meta_adset_id_fk", adsetId);
  if (adsListErr) {
    console.error(`[meta/ads] ads list: ${adsListErr.message}`);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  type AdRow = {
    id: string;
    meta_ad_id: string;
    ad_name: string | null;
    effective_status: string | null;
  };
  const ads = (adRows ?? []) as AdRow[];
  if (ads.length === 0) {
    return NextResponse.json({ ads: [] satisfies AdOut[] });
  }

  const adUuids = ads.map((a) => a.id);

  const { data: insightRows, error: insErr } = await sb
    .from("meta_ad_insights")
    .select("meta_ad_id_fk, spend, impressions, clicks, purchases, revenue")
    .eq("user_id", userId)
    .gte("date", since)
    .lte("date", until)
    .in("meta_ad_id_fk", adUuids);
  if (insErr) {
    console.error(`[meta/ads] insights: ${insErr.message}`);
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
  const perAdTotals = new Map<string, Totals>();
  for (const r of (insightRows ?? []) as Array<{
    meta_ad_id_fk: string | null;
    spend: number | string | null;
    impressions: number | string | null;
    clicks: number | string | null;
    purchases: number | null;
    revenue: number | string | null;
  }>) {
    const id = r.meta_ad_id_fk;
    if (!id) continue;
    const t =
      perAdTotals.get(id) ??
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
    if (r.revenue !== null && r.revenue !== undefined) {
      t.revenue += Number(r.revenue);
      t.hasRevenue = true;
    }
    perAdTotals.set(id, t);
  }

  const out: AdOut[] = ads
    .map((a) => {
      const t = perAdTotals.get(a.id) ?? {
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
        meta_ad_id: a.meta_ad_id,
        name: a.ad_name,
        effective_status: a.effective_status,
        creative_type: null,
        utm: null,
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
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({ ads: out });
}
