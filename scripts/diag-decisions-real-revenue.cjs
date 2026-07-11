/* eslint-disable */
// One-shot read-only diagnostic for the Decision Engine real-revenue gap.
//
// Run:
//   node scripts/diag-decisions-real-revenue.cjs <user_id> <project_id>
//
// Prints three blocks:
//   A — raw orders for the project (no date filter)
//   B — what buildMonthlySnapshot sees (this-month UTC window + per-campaign rollup)
//   C — Sales-style aggregation for comparison (this-month + all-time)
//
// Nothing is mutated. All queries are SELECTs via the service-role client.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const file = path.join(__dirname, "..", ".env.local");
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function thisMonthRangeUtc() {
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const iso = (d) => d.toISOString().slice(0, 10);
  return { since: iso(since), until: iso(until) };
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function main() {
  loadEnv();

  const userId = process.argv[2];
  const projectId = process.argv[3];
  if (!userId || !projectId) {
    console.error(
      "Usage: node scripts/diag-decisions-real-revenue.cjs <user_id> <project_id>"
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n# Diagnostic for user=${userId} project=${projectId}`);

  // -----------------------------------------------------------------
  // BLOCK A — raw orders, no date filter
  // -----------------------------------------------------------------
  console.log("\n──────────────────────────────────────────────────");
  console.log("BLOCK A — Raw orders for this project (no date filter)");
  console.log("──────────────────────────────────────────────────");
  const { data: allOrders, error: allErr } = await sb
    .from("orders")
    .select(
      "id, order_date, revenue, currency, sales_source_id, attribution_status, matched_meta_campaign_id, matched_meta_adset_id, matched_meta_ad_id"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("order_date", { ascending: false })
    .limit(500);

  if (allErr) {
    console.error("orders lookup failed:", allErr.message);
    process.exit(1);
  }

  // Resolve source_type for the orders (orders.sales_source_id → sales_sources.source_type).
  const sourceIds = Array.from(
    new Set(
      (allOrders || [])
        .map((o) => o.sales_source_id)
        .filter((v) => !!v)
    )
  );
  const sourceTypeById = new Map();
  if (sourceIds.length > 0) {
    const { data: srcRows } = await sb
      .from("sales_sources")
      .select("id, source_type")
      .in("id", sourceIds);
    for (const r of srcRows || []) sourceTypeById.set(r.id, r.source_type);
  }

  const flat = (allOrders || []).map((o) => ({
    order_date: o.order_date,
    revenue: num(o.revenue),
    source_type: o.sales_source_id
      ? sourceTypeById.get(o.sales_source_id) || "?"
      : "manual",
    attribution_status: o.attribution_status,
    matched_campaign: o.matched_meta_campaign_id ? "Y" : "—",
    matched_adset: o.matched_meta_adset_id ? "Y" : "—",
    matched_ad: o.matched_meta_ad_id ? "Y" : "—",
  }));

  console.log(`Total orders rows: ${flat.length}`);
  const matchedCount = (allOrders || []).filter(
    (o) => !!o.matched_meta_campaign_id
  ).length;
  console.log(`Rows with matched_meta_campaign_id: ${matchedCount}`);
  if (flat.length === 0) {
    console.log("(no orders at all — both blocks below will be empty)");
  } else {
    console.table(flat.slice(0, 50));
    if (flat.length > 50) {
      console.log(`… (+${flat.length - 50} more rows trimmed)`);
    }
  }

  // -----------------------------------------------------------------
  // BLOCK B — what the Decision Engine snapshot sees
  // -----------------------------------------------------------------
  const { since, until } = thisMonthRangeUtc();
  console.log("\n──────────────────────────────────────────────────");
  console.log(`BLOCK B — Decision Engine view (this-month UTC: ${since} → ${until})`);
  console.log("──────────────────────────────────────────────────");

  const inWindow = (allOrders || []).filter(
    (o) => o.order_date >= since && o.order_date <= until
  );
  console.log(`Orders passing date filter: ${inWindow.length}`);
  if (inWindow.length > 0) {
    console.table(
      inWindow.map((o) => ({
        order_date: o.order_date,
        revenue: num(o.revenue),
        attribution_status: o.attribution_status,
        matched_campaign: o.matched_meta_campaign_id || "—",
      }))
    );
  }

  // Project → active AA UUIDs (same chain-active filter the snapshot uses).
  const { data: bindings } = await sb
    .from("project_meta_ad_accounts")
    .select(
      "meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )"
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active");

  const aaUuids = [];
  for (const b of bindings || []) {
    const bm = b.project_meta_business_managers;
    const conn = bm && bm.meta_connections;
    if (!bm || bm.status !== "active") continue;
    if (!conn || conn.status !== "active") continue;
    if (b.meta_ad_account_id) aaUuids.push(b.meta_ad_account_id);
  }
  console.log(`Active AA UUIDs for project: ${aaUuids.length}`);

  // Campaigns under those AAs.
  let campaigns = [];
  if (aaUuids.length > 0) {
    const { data } = await sb
      .from("meta_campaigns")
      .select("id, campaign_name, meta_ad_account_id, effective_status")
      .in("meta_ad_account_id", aaUuids);
    campaigns = data || [];
  }
  const campaignNameById = new Map();
  for (const c of campaigns) campaignNameById.set(c.id, c.campaign_name || "—");

  // Campaign spend MTD (sum of meta_campaign_insights in window).
  const spendByCampaign = new Map();
  if (campaigns.length > 0) {
    const { data: insights } = await sb
      .from("meta_campaign_insights")
      .select("meta_campaign_id_fk, spend")
      .gte("date", since)
      .lte("date", until)
      .in(
        "meta_campaign_id_fk",
        campaigns.map((c) => c.id)
      );
    for (const r of insights || []) {
      const k = r.meta_campaign_id_fk;
      if (!k) continue;
      spendByCampaign.set(k, (spendByCampaign.get(k) || 0) + num(r.spend));
    }
  }

  // Orders → matched campaign rollup (using same in-window orders).
  const realByCampaign = new Map();
  for (const o of inWindow) {
    const k = o.matched_meta_campaign_id;
    if (!k) continue;
    const bucket = realByCampaign.get(k) || { revenue: 0, orders: 0 };
    bucket.revenue += num(o.revenue);
    bucket.orders += 1;
    realByCampaign.set(k, bucket);
  }

  // Snapshot-style aggregate totals (revenue counts even unmatched orders).
  const totalRealRevenue = inWindow.reduce((a, o) => a + num(o.revenue), 0);
  const totalRealOrders = inWindow.length;
  console.log(`\nsnapshot.totals.realRevenue (in window): ${totalRealRevenue}`);
  console.log(`snapshot.totals.realOrders  (in window): ${totalRealOrders}`);

  // Per-campaign table — only campaigns the snapshot would surface (spend > 0
  // is the closest proxy to "had insights in month" without pulling adset/ad).
  const perCampaignRows = campaigns
    .map((c) => {
      const spend = spendByCampaign.get(c.id) || 0;
      const real = realByCampaign.get(c.id) || { revenue: 0, orders: 0 };
      return {
        campaign_id: c.id.slice(0, 8) + "…",
        name: (c.campaign_name || "—").slice(0, 40),
        spend: Math.round(spend * 100) / 100,
        realRevenue: Math.round(real.revenue * 100) / 100,
        realOrders: real.orders,
        realRoas:
          spend > 0
            ? Math.round((real.revenue / spend) * 100) / 100
            : null,
      };
    })
    .filter((r) => r.spend > 0 || r.realRevenue > 0)
    .sort((a, b) => b.spend - a.spend);

  console.log(`\nCampaigns with spend>0 or realRevenue>0 in window:`);
  if (perCampaignRows.length === 0) {
    console.log("(none — snapshot would show empty campaigns array)");
  } else {
    console.table(perCampaignRows);
  }
  const campaignsWithRealRevenue = perCampaignRows.filter(
    (r) => r.realRevenue > 0
  ).length;
  console.log(
    `Snapshot would surface realRevenue>0 on ${campaignsWithRealRevenue} campaign(s).`
  );

  // -----------------------------------------------------------------
  // BLOCK C — Sales-style aggregation for comparison
  // -----------------------------------------------------------------
  console.log("\n──────────────────────────────────────────────────");
  console.log("BLOCK C — Sales-style aggregation");
  console.log("──────────────────────────────────────────────────");
  console.log(
    "Sales endpoint (/api/sales/analytics) groups by matched_meta_campaign_id;"
  );
  console.log(
    "date range comes from the global topbar (NOT thisMonthRangeUtc)."
  );
  console.log(
    "Decision Engine matches by the same field but locks to this-month UTC."
  );

  // (1) Sales-style aggregation in the SAME window as Decision Engine.
  const salesMtd = new Map();
  for (const o of inWindow) {
    const k = o.matched_meta_campaign_id;
    if (!k) continue;
    const bucket = salesMtd.get(k) || { revenue: 0, orders: 0 };
    bucket.revenue += num(o.revenue);
    bucket.orders += 1;
    salesMtd.set(k, bucket);
  }
  console.log(
    `\nSales-style sum, same window (${since}..${until}): rows=${salesMtd.size}`
  );
  console.table(
    Array.from(salesMtd.entries()).map(([id, v]) => ({
      campaign_id: id.slice(0, 8) + "…",
      name: (campaignNameById.get(id) || "—").slice(0, 40),
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders,
    }))
  );

  // (2) Sales-style aggregation ALL-TIME (so we can see what Sales would
  // show with a wider topbar window — common explanation for the gap).
  const salesAllTime = new Map();
  for (const o of allOrders || []) {
    const k = o.matched_meta_campaign_id;
    if (!k) continue;
    const bucket = salesAllTime.get(k) || { revenue: 0, orders: 0 };
    bucket.revenue += num(o.revenue);
    bucket.orders += 1;
    salesAllTime.set(k, bucket);
  }
  console.log(
    `\nSales-style sum, ALL TIME (no date filter): rows=${salesAllTime.size}`
  );
  console.table(
    Array.from(salesAllTime.entries()).map(([id, v]) => ({
      campaign_id: id.slice(0, 8) + "…",
      name: (campaignNameById.get(id) || "—").slice(0, 40),
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders,
    }))
  );

  // Distribution of order_dates relative to the window — answers "are
  // matched orders sitting outside the this-month UTC window?".
  const matched = (allOrders || []).filter(
    (o) => !!o.matched_meta_campaign_id
  );
  const before = matched.filter((o) => o.order_date < since).length;
  const inside = matched.filter(
    (o) => o.order_date >= since && o.order_date <= until
  ).length;
  const after = matched.filter((o) => o.order_date > until).length;
  console.log(
    `\nMatched orders by date vs window: before=${before}  inside=${inside}  after=${after}`
  );

  console.log("\n──────────────────────────────────────────────────");
  console.log("Done. Read each block top-to-bottom — the gap shows up");
  console.log("as either (1) matched orders outside the window or (2)");
  console.log("matched orders inside the window not landing on any");
  console.log("campaign in Block B's per-campaign table.");
  console.log("──────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
