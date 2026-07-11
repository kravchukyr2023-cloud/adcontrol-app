/* eslint-disable */
// One-shot read-only diagnostic for the drawer's "no signals" gap.
//
// Run:
//   node scripts/diag-drawer-pipeline.cjs <user_id> <project_id>
//
// Tracks the data path:
//
//   buildMonthlySnapshot (fresh every request)
//        ↓ campaigns[].id
//   evaluateSnapshot → decisions.issues[] (fresh)
//        ↓ issue.id = "C1:<campaign-uuid>"
//   assembleDecisions returns:
//     - decisions.issues       — FRESH
//     - explanation.issueExp.. — FROM CACHE (decision_explanations row)
//        ↓
//   <DiagnosisDrawerProvider /> filters by entity.id, then in lines 248-249
//   silently DROPS any issue whose narrative is not in explanation.issueExp.
//
// This script:
//   1. Replicates the fresh C1 issue set (from monthly-snapshot + rule).
//   2. Pulls the cached decision_explanations row for (project, month).
//   3. Cross-references: which fresh issue ids are missing from the cache?

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
    console.error("Usage: node scripts/diag-drawer-pipeline.cjs <user_id> <project_id>");
    process.exit(1);
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { since, until } = thisMonthRangeUtc();
  const month = since.slice(0, 7);
  console.log(`\n# Drawer pipeline diagnosis`);
  console.log(`# user=${userId} project=${projectId}`);
  console.log(`# Window: ${since} → ${until}   Cache month key: ${month}\n`);

  // ---------------------------------------------------------------
  // STAGE 1 — Replicate the FRESH C1 issue set the way the rule does.
  // ---------------------------------------------------------------
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

  const { data: aaIns } = await sb
    .from("meta_ad_account_insights")
    .select("spend")
    .gte("date", since)
    .lte("date", until)
    .in("meta_ad_account_id_fk", aaUuids);
  const totalsSpend = (aaIns || []).reduce((s, r) => s + num(r.spend), 0);

  const { data: campaignsRaw } = await sb
    .from("meta_campaigns")
    .select("id, campaign_name, effective_status, meta_ad_account_id")
    .in("meta_ad_account_id", aaUuids);
  const campaigns = campaignsRaw || [];

  const insightAgg = new Map();
  if (campaigns.length > 0) {
    const { data: cIns } = await sb
      .from("meta_campaign_insights")
      .select("meta_campaign_id_fk, spend, impressions, purchases, revenue")
      .gte("date", since)
      .lte("date", until)
      .in("meta_campaign_id_fk", campaigns.map((c) => c.id));
    for (const r of cIns || []) {
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

  const { data: ords } = await sb
    .from("orders")
    .select("revenue, matched_meta_campaign_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);
  const realByCampaign = new Map();
  for (const o of ords || []) {
    const k = o.matched_meta_campaign_id;
    if (!k) continue;
    const cur = realByCampaign.get(k) || { realOrders: 0, realRevenue: 0 };
    cur.realOrders += 1;
    cur.realRevenue += num(o.revenue);
    realByCampaign.set(k, cur);
  }

  // Build the fresh C1 set.
  const freshC1 = [];
  for (const c of campaigns) {
    const ins = insightAgg.get(c.id);
    if (!ins) continue;
    const real = realByCampaign.get(c.id) || { realOrders: 0, realRevenue: 0 };
    if (ins.spend <= 0) continue;
    if (real.realOrders > 0) continue;
    const share = ins.spend / totalsSpend;
    if (share < SHARE_THRESHOLD) continue;
    freshC1.push({
      issueId: `C1:${c.id}`,
      entityId: c.id,
      entityName: c.campaign_name || "—",
      severity: share >= CRITICAL_SHARE ? "critical" : "warning",
      share: round2(share),
      spend: round2(ins.spend),
    });
  }

  // ---------------------------------------------------------------
  // STAGE 2 — Pull the CACHED explanation row for (project, month).
  // ---------------------------------------------------------------
  const { data: cacheRow, error: cacheErr } = await sb
    .from("decision_explanations")
    .select(
      "id, project_id, month, computed_at, updated_at, explanation"
    )
    .eq("project_id", projectId)
    .eq("month", month)
    .maybeSingle();
  if (cacheErr) {
    console.error("cache lookup failed:", cacheErr.message);
    process.exit(1);
  }

  console.log("──────────────────────────────────────────────────");
  console.log("BLOCK 1 — FRESH C1 issues (what evaluate would emit NOW)");
  console.log("──────────────────────────────────────────────────");
  if (freshC1.length === 0) {
    console.log("(none)");
  } else {
    console.table(
      freshC1.map((i) => ({
        issueId: i.issueId.slice(0, 16) + "…",
        entityName: i.entityName.slice(0, 38),
        severity: i.severity,
        share: i.share,
        spend: i.spend,
      }))
    );
  }

  console.log("\n──────────────────────────────────────────────────");
  console.log(`BLOCK 2 — CACHED explanation row (decision_explanations)`);
  console.log("──────────────────────────────────────────────────");
  if (!cacheRow) {
    console.log("NO CACHED ROW — assemble would generate fresh AND save.");
    console.log("(So drawer's first hit today should be aligned.)");
  } else {
    const exp = cacheRow.explanation || {};
    const keys = Object.keys(exp.issueExplanations || {});
    console.log(`row.id: ${cacheRow.id}`);
    console.log(`row.computed_at: ${cacheRow.computed_at}`);
    console.log(`row.updated_at:  ${cacheRow.updated_at}`);
    console.log(`explanation.schemaVersion: ${exp.schemaVersion}`);
    console.log(`explanation.llmUsed:        ${exp.llmUsed}`);
    console.log(`explanation.generatedAt:    ${exp.generatedAt}`);
    console.log(
      `explanation.issueExplanations keys: ${keys.length}`
    );
    if (keys.length > 0) {
      console.log("\nKeys present in cached issueExplanations:");
      for (const k of keys) {
        const narrative = exp.issueExplanations[k];
        const hasAll =
          narrative &&
          typeof narrative.impact === "string" &&
          typeof narrative.diagnosis === "string" &&
          typeof narrative.action === "string" &&
          typeof narrative.expectedResult === "string";
        console.log(`  - ${k.padEnd(50)} ${hasAll ? "(4-field)" : "(INCOMPLETE)"}`);
      }
    }

    // ---------------------------------------------------------------
    // STAGE 3 — Cross-reference.
    // ---------------------------------------------------------------
    console.log("\n──────────────────────────────────────────────────");
    console.log("BLOCK 3 — Cross-reference FRESH vs CACHED for the 2 big C1s");
    console.log("──────────────────────────────────────────────────");
    console.table(
      freshC1.map((i) => {
        const present = Object.prototype.hasOwnProperty.call(
          exp.issueExplanations || {},
          i.issueId
        );
        return {
          issueId: i.issueId,
          entityName: i.entityName.slice(0, 38),
          in_fresh_decisions: "✅ yes",
          in_cached_explanation: present ? "✅ yes" : "❌ MISSING",
          drawer_outcome: present
            ? "renders IssueCard"
            : "DROPPED (line 248-249: if (!narrative) return null)",
        };
      })
    );

    // ---------------------------------------------------------------
    // STAGE 4 — Set delta (which keys exist on only one side).
    // ---------------------------------------------------------------
    const freshIds = new Set(freshC1.map((i) => i.issueId));
    const cachedIds = new Set(keys);
    const onlyFresh = [...freshIds].filter((id) => !cachedIds.has(id));
    const onlyCached = [...cachedIds]
      .filter((id) => id.startsWith("C1:"))
      .filter((id) => !freshIds.has(id));

    console.log("\n──────────────────────────────────────────────────");
    console.log("BLOCK 4 — C1 set delta");
    console.log("──────────────────────────────────────────────────");
    console.log(`C1 issues in FRESH decisions only (missing narrative): ${onlyFresh.length}`);
    for (const id of onlyFresh) console.log(`  - ${id}`);
    console.log(`C1 keys in CACHED explanation only (stale): ${onlyCached.length}`);
    for (const id of onlyCached) console.log(`  - ${id}`);
  }

  console.log("\n──────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
