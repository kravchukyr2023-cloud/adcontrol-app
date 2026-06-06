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
 * Aggregates this-month (UTC) Meta spend / purchases / revenue per
 * project for the authenticated user, alongside whether the project
 * currently has a live Meta data path (active selection → active BM
 * membership → active meta_connection).
 *
 * Data is read from our DB (`meta_ad_account_insights`), NOT from
 * the Meta API. Daily insights for all of a user's bound AAs are
 * pulled in a single query and aggregated client-side; for a typical
 * user with ≤ 10 projects × 30 days, this is well under 1000 rows.
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

  // PostgREST returns embedded relations as arrays regardless of cardinality
  // (the FK here is many-to-one, but the response shape is always `[parent]`).
  // We pluck `[0]` and treat a missing parent as "chain broken".
  type BindingRow = {
    project_id: string;
    meta_ad_account_id: string | null;
    project_meta_business_managers: Array<{
      status: string | null;
      meta_connections: Array<{ status: string | null }> | null;
    }> | null;
  };

  // Per-project: set of meta_ad_accounts.id (uuid) values whose entire
  // chain (selection → BM membership → connection) is currently active.
  // Same set drives `hasActiveMetaConnection`.
  const projectAaMap = new Map<string, Set<string>>();
  const projectConnectedSet = new Set<string>();

  for (const b of (bindingRows ?? []) as BindingRow[]) {
    const bm = b.project_meta_business_managers?.[0];
    const conn = bm?.meta_connections?.[0];
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
  //    one query. We aggregate per project in JS afterwards.
  const allAaUuids = Array.from(
    new Set(
      Array.from(projectAaMap.values()).flatMap((s) => Array.from(s))
    )
  );

  const { since, until } = thisMonthRangeUtc();

  type InsightTotal = { spend: number; purchases: number; revenue: number };
  const perAaTotals = new Map<string, InsightTotal>();

  if (allAaUuids.length > 0) {
    const { data: insightRows, error: insErr } = await sb
      .from("meta_ad_account_insights")
      .select("meta_ad_account_id_fk, spend, purchases, revenue")
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
      revenue: number | string | null;
    }>) {
      const aaUuid = r.meta_ad_account_id_fk;
      if (!aaUuid) continue;
      const entry = perAaTotals.get(aaUuid) ?? {
        spend: 0,
        purchases: 0,
        revenue: 0,
      };
      // numeric() columns come back as strings from PostgREST; Number()
      // coerces both that and bare numbers safely.
      entry.spend += Number(r.spend ?? 0);
      entry.purchases += Number(r.purchases ?? 0);
      entry.revenue += Number(r.revenue ?? 0);
      perAaTotals.set(aaUuid, entry);
    }
  }

  // 4. Roll up to project level.
  const summaries: Summary[] = projects.map((p) => {
    const aaSet = projectAaMap.get(p.id);
    let spend = 0;
    let purchases = 0;
    let revenue = 0;
    if (aaSet) {
      for (const aaUuid of aaSet) {
        const t = perAaTotals.get(aaUuid);
        if (!t) continue;
        spend += t.spend;
        purchases += t.purchases;
        revenue += t.revenue;
      }
    }
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
