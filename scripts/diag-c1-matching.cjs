/* eslint-disable */
// One-shot read-only diagnostic for the C1 (burned-budget) rule.
//
// Run:
//   node scripts/diag-c1-matching.cjs <user_id> <project_id>
//
// Asks three questions:
//   1. Which campaigns are burned-budget candidates (spend > 0, realOrders === 0)?
//   2. Which C1 issues does the rule actually emit (share >= 0.10 threshold)?
//   3. Does each candidate match a C1 issue by entityId? Or is the drawer
//      empty because (a) the rule legitimately skipped it for share, or
//      (b) the issue was emitted but with a mismatching entityId?
//
// Replicates the snapshot + C1 logic inline (no TS bundling); thresholds are
// pinned to TUNING.campaignSpendSignificance = 0.10 and
// TUNING.campaignSpendCriticalShare = 0.20 (see src/server/decisions/rules.ts).

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Pinned to the values in src/server/decisions/rules.ts TUNING.
const SHARE_THRESHOLD = 0.1;
const CRITICAL_SHARE = 0.2;

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

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  loadEnv();
  const userId = process.argv[2];
  const projectId = process.argv[3];
  if (!userId || !projectId) {
    console.error(
      "Usage: node scripts/diag-c1-matching.cjs <user_id> <project_id>"
    );
    process.exit(1);
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { since, until } = thisMonthRangeUtc();
  console.log(
    `\n# C1 diagnosis for user=${userId} project=${projectId}`
  );
  console.log(`# Window: ${since} → ${until}`);
  console.log(
    `# Thresholds: share >= ${SHARE_THRESHOLD} fires, share >= ${CRITICAL_SHARE} = critical\n`
  );

  // 1. Active AA UUIDs (same chain-active filter monthly-snapshot uses).
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
  if (aaUuids.length === 0) {
    console.log("No active AAs — snapshot would be empty.");
    return;
  }

  // 2. totals.spend = sum of meta_ad_account_insights spend in window
  //    (denominator the C1 rule uses).
  const { data: aaInsights } = await sb
    .from("meta_ad_account_insights")
    .select("meta_ad_account_id_fk, spend")
    .gte("date", since)
    .lte("date", until)
    .in("meta_ad_account_id_fk", aaUuids);
  let totalsSpend = 0;
  for (const r of aaInsights || []) totalsSpend += num(r.spend);
  console.log(`totals.spend (AA-level aggregate): ${round2(totalsSpend)}`);
  if (totalsSpend <= 0) {
    console.log("totals.spend = 0 → C1 rule short-circuits, emits 0 issues.");
    return;
  }

  // 3. Campaigns under those AAs.
  const { data: campaignsRaw } = await sb
    .from("meta_campaigns")
    .select(
      "id, campaign_name, effective_status, status, meta_ad_account_id"
    )
    .in("meta_ad_account_id", aaUuids);
  const campaigns = campaignsRaw || [];

  // 4. Per-campaign insights in window.
  const insightAgg = new Map(); // id -> { spend, impressions, purchases, revenue }
  if (campaigns.length > 0) {
    const { data: cInsights } = await sb
      .from("meta_campaign_insights")
      .select(
        "meta_campaign_id_fk, spend, impressions, purchases, revenue"
      )
      .gte("date", since)
      .lte("date", until)
      .in(
        "meta_campaign_id_fk",
        campaigns.map((c) => c.id)
      );
    for (const r of cInsights || []) {
      const k = r.meta_campaign_id_fk;
      if (!k) continue;
      const cur = insightAgg.get(k) || {
        spend: 0,
        impressions: 0,
        purchases: 0,
        revenue: 0,
      };
      cur.spend += num(r.spend);
      cur.impressions += num(r.impressions);
      cur.purchases += num(r.purchases);
      cur.revenue += num(r.revenue);
      insightAgg.set(k, cur);
    }
  }

  // 5. Orders in window grouped by matched_meta_campaign_id.
  const { data: ordersInWindow } = await sb
    .from("orders")
    .select("revenue, matched_meta_campaign_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);

  const realByCampaign = new Map(); // id -> { realOrders, realRevenue }
  for (const o of ordersInWindow || []) {
    const k = o.matched_meta_campaign_id;
    if (!k) continue;
    const cur = realByCampaign.get(k) || { realOrders: 0, realRevenue: 0 };
    cur.realOrders += 1;
    cur.realRevenue += num(o.revenue);
    realByCampaign.set(k, cur);
  }

  // 6. Build the snapshot-equivalent campaign array. Inclusion rule
  //    (matches monthly-snapshot): include only campaigns that have any
  //    insight row in the month, i.e. id ∈ insightAgg.
  const snapshotCampaigns = [];
  for (const c of campaigns) {
    const ins = insightAgg.get(c.id);
    if (!ins) continue; // not in snapshot at all
    const real = realByCampaign.get(c.id) || { realOrders: 0, realRevenue: 0 };
    snapshotCampaigns.push({
      id: c.id,
      name: c.campaign_name || "—",
      effective_status: c.effective_status,
      spend: ins.spend,
      impressions: ins.impressions,
      purchases: ins.purchases,
      metaRevenue: ins.revenue,
      realOrders: real.realOrders,
      realRevenue: real.realRevenue,
      share: ins.spend / totalsSpend,
    });
  }
  console.log(`Campaigns in snapshot (had insights this month): ${snapshotCampaigns.length}\n`);

  // 7. C1 candidates: spend > 0 AND realOrders === 0.
  const candidates = snapshotCampaigns
    .filter((c) => c.spend > 0 && c.realOrders === 0)
    .sort((a, b) => b.spend - a.spend);

  console.log("──────────────────────────────────────────────────");
  console.log(
    `BLOCK 1 — BURNED-BUDGET CANDIDATES (spend > 0 AND realOrders === 0)`
  );
  console.log("──────────────────────────────────────────────────");
  if (candidates.length === 0) {
    console.log("(none)");
  } else {
    console.table(
      candidates.map((c) => ({
        id_prefix: c.id.slice(0, 8) + "…",
        name: c.name.slice(0, 42),
        spend: round2(c.spend),
        share: round2(c.share),
        purchases: c.purchases,
        metaRev: round2(c.metaRevenue),
        passes_C1: c.share >= SHARE_THRESHOLD ? "YES" : "no",
        severity:
          c.share >= CRITICAL_SHARE
            ? "critical"
            : c.share >= SHARE_THRESHOLD
              ? "warning"
              : "—",
      }))
    );
  }

  // 8. Generated C1 issues (replicating the rule).
  const c1Issues = candidates
    .filter((c) => c.share >= SHARE_THRESHOLD)
    .map((c) => ({
      id: `C1:${c.id}`,
      ruleId: "C1_campaign_burned_budget",
      severity: c.share >= CRITICAL_SHARE ? "critical" : "warning",
      level: "campaign",
      entityId: c.id,
      entityName: c.name,
      title: `Campaign spent ${round2(c.spend)} with no real orders`,
      facts: {
        spend: round2(c.spend),
        share: round2(c.share),
        realOrders: c.realOrders,
        metaRevenue: round2(c.metaRevenue),
        impressions: c.impressions,
        effectiveStatus: c.effective_status,
      },
    }));

  console.log("\n──────────────────────────────────────────────────");
  console.log(`BLOCK 2 — GENERATED C1 ISSUES (${c1Issues.length})`);
  console.log("──────────────────────────────────────────────────");
  if (c1Issues.length === 0) {
    console.log("(none — every candidate is below share threshold)");
  } else {
    console.table(
      c1Issues.map((i) => ({
        issue_id: i.id.slice(0, 16) + "…",
        entityId_prefix: i.entityId.slice(0, 8) + "…",
        entityName: i.entityName.slice(0, 36),
        severity: i.severity,
        share: i.facts.share,
        spend: i.facts.spend,
      }))
    );
  }

  // 9. Matching: for each candidate, does an emitted issue's entityId equal
  //    the campaign's id? (Drawer filters by `i.entityId === entity.id`.)
  console.log("\n──────────────────────────────────────────────────");
  console.log("BLOCK 3 — MATCHING (candidate.id vs C1.entityId)");
  console.log("──────────────────────────────────────────────────");
  const issuesById = new Map(c1Issues.map((i) => [i.entityId, i]));
  const matchRows = candidates.map((c) => {
    const issue = issuesById.get(c.id);
    if (!issue) {
      return {
        id_prefix: c.id.slice(0, 8) + "…",
        name: c.name.slice(0, 36),
        share: round2(c.share),
        result:
          c.share < SHARE_THRESHOLD
            ? "❌ no C1 — share below threshold"
            : "❌ no C1 — UNEXPECTED",
      };
    }
    if (issue.entityId === c.id) {
      return {
        id_prefix: c.id.slice(0, 8) + "…",
        name: c.name.slice(0, 36),
        share: round2(c.share),
        result: `✅ match (severity=${issue.severity})`,
      };
    }
    return {
      id_prefix: c.id.slice(0, 8) + "…",
      name: c.name.slice(0, 36),
      share: round2(c.share),
      result: `⚠️ entityId mismatch: ${issue.entityId.slice(0, 8)}…`,
    };
  });
  if (matchRows.length === 0) {
    console.log("(no candidates to match)");
  } else {
    console.table(matchRows);
  }

  // 10. Summary.
  const lostToShare = candidates.filter(
    (c) => c.share < SHARE_THRESHOLD
  ).length;
  const matched = candidates.filter((c) => {
    const i = issuesById.get(c.id);
    return i && i.entityId === c.id;
  }).length;
  const mismatched = candidates.filter((c) => {
    const i = issuesById.get(c.id);
    return i && i.entityId !== c.id;
  }).length;

  console.log("\n──────────────────────────────────────────────────");
  console.log("SUMMARY");
  console.log("──────────────────────────────────────────────────");
  console.log(`Burned-budget candidates:                ${candidates.length}`);
  console.log(`  ↳ with C1 emitted (share ≥ ${SHARE_THRESHOLD}):    ${c1Issues.length}`);
  console.log(`  ↳ lost to share threshold:             ${lostToShare}`);
  console.log(`  ↳ entityId matches campaign.id:        ${matched}`);
  console.log(`  ↳ entityId mismatch (BUG):             ${mismatched}`);
  console.log("──────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
