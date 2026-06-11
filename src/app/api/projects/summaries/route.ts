import { NextResponse } from "next/server";
import {
  getServerSupabase,
  getServerUserId,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/projects/summaries
 *
 * Aggregates this-month (UTC) actuals per project for the authenticated
 * user, alongside whether the project currently has a live Meta data path
 * (active selection → active BM membership → active meta_connection).
 *
 * Field provenance (Stage 23 hybrid philosophy):
 *   - actualSpend     ← meta_ad_account_insights.spend (Meta side)
 *   - actualPurchases ← meta_ad_account_insights.purchases (Meta side)
 *   - actualRevenue   ← orders.revenue (Stage 19 ingest, Stage 22+ hybrid)
 *   - actualRoas      ← actualRevenue / actualSpend (hybrid)
 *
 * Data is read from our DB, never the Meta API. Daily insights for all of
 * a user's bound AAs and all orders in the month are pulled in two flat
 * queries and aggregated client-side; for a typical user with ≤ 10 projects
 * × 30 days, this is well under 1000 rows.
 *
 * Scope:
 *   - Period is hard-coded to "this month" (UTC). The global topbar
 *     period selector is intentionally ignored — the Choose-a-project
 *     screen surfaces a stable monthly snapshot, not whatever window
 *     the user last viewed inside a project.
 *   - RLS scopes every query by user_id; we still pass `.eq("user_id",
 *     userId)` explicitly so a future RLS-bypassing admin client would
 *     keep behaving correctly.
 */

type Summary = {
  projectId: string;
  actualSpend: number;
  actualPurchases: number;
  actualRevenue: number;
  actualRoas: number;
  hasActiveMetaConnection: boolean;
};

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

export async function GET() {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = await getServerSupabase();

  // 1. All projects for the user.
  const { data: projectRows, error: projErr } = await sb
    .from("projects")
    .select("id")
    .eq("user_id", userId);

  if (projErr) {
    console.error(`[summaries] projects lookup: ${projErr.message}`);
    return NextResponse.json(
      { error: "DB error loading projects" },
      { status: 500 }
    );
  }

  const projects = (projectRows ?? []) as Array<{ id: string }>;
  if (projects.length === 0) {
    return NextResponse.json({ summaries: [] as Summary[] });
  }

  // 2. Active AA selections + parent BM membership + connection status.
  //    Embedded select traverses:
  //      project_meta_ad_accounts (status='active')
  //        → project_meta_business_managers (status filtered below)
  //          → meta_connections (status filtered below)
  //    We don't !inner-join the parents because we want to surface
  //    every "active selection" row even if the chain upstream has
  //    gone stale — the chain-state check lives in the JS filter
  //    so we can attribute the right reason later if needed.
  const { data: bindingRows, error: bindErr } = await sb
    .from("project_meta_ad_accounts")
    .select(
      "project_id, meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )"
    )
    .eq("user_id", userId)
    .eq("status", "active");

  if (bindErr) {
    console.error(`[summaries] bindings lookup: ${bindErr.message}`);
    return NextResponse.json(
      { error: "DB error loading bindings" },
      { status: 500 }
    );
  }

  // PostgREST returns to-one embeds (FK on the embedding side) as a
  // single object, not an array. Supabase-js TS inference is conservative
  // and surfaces both shapes as arrays — we cast through `unknown` to the
  // correct runtime shape, matching the pattern in
  // `src/app/api/meta/project-aas/route.ts` (see lines 87-94).
  type BindingRow = {
    project_id: string;
    meta_ad_account_id: string | null;
    project_meta_business_managers: {
      status: string | null;
      meta_connections: { status: string | null } | null;
    } | null;
  };

  // Per-project: set of meta_ad_accounts.id (uuid) values whose entire
  // chain (selection → BM membership → connection) is currently active.
  // Same set drives `hasActiveMetaConnection`.
  const projectAaMap = new Map<string, Set<string>>();
  const projectConnectedSet = new Set<string>();

  for (const b of (bindingRows ?? []) as unknown as BindingRow[]) {
    const bm = b.project_meta_business_managers;
    const conn = bm?.meta_connections;
    const bmActive = bm?.status === "active";
    const connActive = conn?.status === "active";
    if (!bmActive || !connActive) continue;
    projectConnectedSet.add(b.project_id);
    if (b.meta_ad_account_id) {
      let set = projectAaMap.get(b.project_id);
      if (!set) {
        set = new Set<string>();
        projectAaMap.set(b.project_id, set);
      }
      set.add(b.meta_ad_account_id);
    }
  }

  // 3. Daily insights for every distinct AA across all projects, in
  //    one query. We aggregate per project in JS afterwards. NOTE we
  //    deliberately keep selecting `revenue` from Meta even though
  //    nothing on these cards uses it any more — leaving it untouched
  //    means the Meta backfill (Stage 12) still feeds the META REV
  //    column on /sales (Stage 14) without a second query path.
  const allAaUuids = Array.from(
    new Set(
      Array.from(projectAaMap.values()).flatMap((s) => Array.from(s))
    )
  );

  const { since, until } = thisMonthRangeUtc();

  type InsightTotal = { spend: number; purchases: number };
  const perAaTotals = new Map<string, InsightTotal>();

  if (allAaUuids.length > 0) {
    const { data: insightRows, error: insErr } = await sb
      .from("meta_ad_account_insights")
      .select("meta_ad_account_id_fk, spend, purchases")
      .eq("user_id", userId)
      .gte("date", since)
      .lte("date", until)
      .in("meta_ad_account_id_fk", allAaUuids);

    if (insErr) {
      console.error(`[summaries] insights lookup: ${insErr.message}`);
      return NextResponse.json(
        { error: "DB error loading insights" },
        { status: 500 }
      );
    }

    for (const r of (insightRows ?? []) as Array<{
      meta_ad_account_id_fk: string | null;
      spend: number | string | null;
      purchases: number | null;
    }>) {
      const aaUuid = r.meta_ad_account_id_fk;
      if (!aaUuid) continue;
      const entry = perAaTotals.get(aaUuid) ?? {
        spend: 0,
        purchases: 0,
      };
      // numeric() columns come back as strings from PostgREST; Number()
      // coerces both that and bare numbers safely.
      entry.spend += Number(r.spend ?? 0);
      entry.purchases += Number(r.purchases ?? 0);
      perAaTotals.set(aaUuid, entry);
    }
  }

  // 3b. Real revenue: one flat scan of `orders` for the month, grouped
  //     by project_id in JS. RLS already restricts to the user's rows.
  //     We do NOT join through sales_sources / bindings — orders are
  //     directly project-scoped via orders.project_id.
  const projectRevenue = new Map<string, number>();
  {
    const { data: orderRows, error: ordErr } = await sb
      .from("orders")
      .select("project_id, revenue")
      .eq("user_id", userId)
      .gte("order_date", since)
      .lte("order_date", until);

    if (ordErr) {
      console.error(`[summaries] orders lookup: ${ordErr.message}`);
      return NextResponse.json(
        { error: "DB error loading orders" },
        { status: 500 }
      );
    }

    for (const r of (orderRows ?? []) as Array<{
      project_id: string;
      revenue: number | string | null;
    }>) {
      const rev = Number(r.revenue ?? 0);
      if (!Number.isFinite(rev)) continue;
      projectRevenue.set(
        r.project_id,
        (projectRevenue.get(r.project_id) ?? 0) + rev
      );
    }
  }

  // 4. Roll up to project level. actualRevenue is sourced from orders
  //    (NOT meta_ad_account_insights.revenue); actualRoas is the hybrid
  //    ratio. Spend + purchases stay on the Meta side.
  const summaries: Summary[] = projects.map((p) => {
    const aaSet = projectAaMap.get(p.id);
    let spend = 0;
    let purchases = 0;
    if (aaSet) {
      for (const aaUuid of aaSet) {
        const t = perAaTotals.get(aaUuid);
        if (!t) continue;
        spend += t.spend;
        purchases += t.purchases;
      }
    }
    const revenue = projectRevenue.get(p.id) ?? 0;
    const roas = revenue > 0 && spend > 0 ? revenue / spend : 0;
    return {
      projectId: p.id,
      actualSpend: spend,
      actualPurchases: purchases,
      actualRevenue: revenue,
      actualRoas: roas,
      hasActiveMetaConnection: projectConnectedSet.has(p.id),
    };
  });

  return NextResponse.json({ summaries });
}
