/* eslint-disable */
// Sprint 6.5 / 1c / Group 1 verification: prints the recommendedAction
// text M0 (month) and C2 (per campaign) would produce for a project,
// against live snapshot data.
//
// Run:
//   node scripts/diag-stage1c-group1.cjs <project_id>
//
// Read-only. Inlines the numbers, the C2 predicate, and the exact
// buildTrackingGapAction template from src/server/decisions/rules.ts so
// the wording matches verbatim what the app renders (no tsx runner
// available; the template is short and duplicated here for parity).

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// Mirrored from src/server/decisions/rules.ts TUNING.
const T = {
  attributionWarningCoverage: 0.3,
  metaOverstateRoasFloor: 0.3,
  metaOverstateSpendShare: 0.05,
};

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

function n(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}

// EXACT clone of buildTrackingGapAction + pluralUa from
// src/server/decisions/rules.ts.
function pluralUa(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function buildTrackingGapAction(args) {
  const meta = Math.max(0, Math.round(args.metaPurchases));
  const real = Math.max(0, Math.round(args.realOrders));
  const metaWord = pluralUa(meta, "продаж", "продажі", "продажів");
  const realWord = pluralUa(real, "продаж", "продажі", "продажів");
  const header = args.campaignName
    ? `Кампанія «${args.campaignName}»: Meta показує ${meta} ${metaWord}, реально ${real} ${realWord}.`
    : `Meta показує ${meta} ${metaWord}, реально підтверджено ${real} ${realWord}.`;
  const scopeHint = args.campaignName
    ? "тестовій заявці цієї кампанії"
    : "тестовій заявці";
  const emScope = args.campaignName ? "у цій кампанії " : "";
  return [
    `Діагноз: ${header} Такий розрив означає одне з двох: або мітки (UTM) не передаються після покупки, або в Meta подія «Purchase» налаштована не на ту дію.`,
    `Задача:`,
    `1. Протестуй мітки на ${scopeHint} — переконайся що UTM доходять після оформлення покупки.`,
    `2. Переглянь у Meta розділ Events Manager — на яку саме дію ${emScope}стоїть подія «Purchase» і чи нема помилки в її налаштуванні.`,
  ].join("\n");
}

function thisMonthUtc() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const t = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const iso = (d) => d.toISOString().slice(0, 10);
  return { since: iso(s), until: iso(t) };
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: node scripts/diag-stage1c-group1.cjs <project_id>");
    process.exit(1);
  }
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ADMIN_KEY;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { since, until } = thisMonthUtc();

  // Project + owner + target_roas.
  const { data: proj } = await admin
    .from("projects")
    .select("user_id, name, target_roas")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) throw new Error("project not found");
  const targetRoas = n(proj.target_roas);

  // Active AA uuids for the project.
  const { data: bindings } = await admin
    .from("project_meta_ad_accounts")
    .select(
      "meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )"
    )
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

  // AA-level totals for month (same source the snapshot uses).
  const { data: aaInsights } = await admin
    .from("meta_ad_account_insights")
    .select("spend, purchases, revenue")
    .eq("user_id", proj.user_id)
    .gte("date", since)
    .lte("date", until)
    .in("meta_ad_account_id_fk", aaUuids);
  let totalSpend = 0;
  let totalMetaPurchases = 0;
  for (const r of aaInsights || []) {
    totalSpend += n(r.spend);
    totalMetaPurchases += n(r.purchases);
  }

  // Real orders totals.
  const { data: orders } = await admin
    .from("orders")
    .select(
      "revenue, matched_meta_campaign_id, attribution_status"
    )
    .eq("user_id", proj.user_id)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);
  const totalRealOrders = (orders || []).length;
  const ordersByCampaign = new Map();
  for (const o of orders || []) {
    const rev = n(o.revenue);
    if (!o.matched_meta_campaign_id) continue;
    const b = ordersByCampaign.get(o.matched_meta_campaign_id) || {
      revenue: 0,
      orders: 0,
    };
    b.revenue += rev;
    b.orders += 1;
    ordersByCampaign.set(o.matched_meta_campaign_id, b);
  }

  const coverage =
    totalMetaPurchases <= 0
      ? 1
      : Math.min(totalRealOrders / totalMetaPurchases, 1);

  console.log(`\nProject: ${proj.name} (${projectId})`);
  console.log(
    `Spend=${totalSpend.toFixed(2)}  Meta purchases=${totalMetaPurchases}  ` +
      `Real orders=${totalRealOrders}  coverage=${(coverage * 100).toFixed(0)}%`
  );

  console.log("\n=== M0 recommendedAction ===");
  if (totalMetaPurchases <= 0 || coverage >= T.attributionWarningCoverage) {
    console.log("(rule would NOT fire on this data — printed anyway for preview)\n");
  }
  console.log(
    buildTrackingGapAction({
      metaPurchases: totalMetaPurchases,
      realOrders: totalRealOrders,
    })
  );

  // C2 per-campaign.
  const { data: campaigns } = await admin
    .from("meta_campaigns")
    .select("id, campaign_name")
    .in("meta_ad_account_id", aaUuids);
  const campaignById = new Map((campaigns || []).map((c) => [c.id, c]));
  const cIds = (campaigns || []).map((c) => c.id);
  const { data: cInsights } = await admin
    .from("meta_campaign_insights")
    .select("meta_campaign_id_fk, spend, purchases, revenue")
    .gte("date", since)
    .lte("date", until)
    .in("meta_campaign_id_fk", cIds);
  const cAgg = new Map();
  for (const r of cInsights || []) {
    if (!r.meta_campaign_id_fk) continue;
    const a = cAgg.get(r.meta_campaign_id_fk) || {
      spend: 0,
      purchases: 0,
      revenue: 0,
    };
    a.spend += n(r.spend);
    a.purchases += n(r.purchases);
    a.revenue += n(r.revenue);
    cAgg.set(r.meta_campaign_id_fk, a);
  }

  console.log("\n=== C2 candidates (per campaign) ===");
  let printed = 0;
  for (const [cid, a] of cAgg) {
    const c = campaignById.get(cid);
    if (!c || a.spend <= 0) continue;
    const metaRoas = a.revenue / a.spend;
    const ord = ordersByCampaign.get(cid) || { revenue: 0, orders: 0 };
    const realRoas = ord.revenue / a.spend;
    const share = totalSpend > 0 ? a.spend / totalSpend : 0;
    const wouldFire =
      targetRoas > 0 &&
      metaRoas >= targetRoas &&
      realRoas < targetRoas * T.metaOverstateRoasFloor &&
      share >= T.metaOverstateSpendShare;
    if (!wouldFire) continue;
    printed++;
    console.log(
      `\n— ${c.campaign_name}  (metaRoas=${metaRoas.toFixed(2)}, ` +
        `realRoas=${realRoas.toFixed(2)}, share=${(share * 100).toFixed(0)}%, ` +
        `Meta purchases=${a.purchases}, real=${ord.orders})`
    );
    console.log(
      buildTrackingGapAction({
        campaignName: c.campaign_name,
        metaPurchases: a.purchases,
        realOrders: ord.orders,
      })
    );
  }
  if (printed === 0) {
    // Fallback: print the template for the largest-spend campaign so the
    // wording is still visible when the C2 predicate isn't tripped.
    const top = [...cAgg.entries()].sort((a, b) => b[1].spend - a[1].spend)[0];
    if (top) {
      const [cid, a] = top;
      const c = campaignById.get(cid);
      const ord = ordersByCampaign.get(cid) || { orders: 0 };
      console.log(
        `\n(no campaign trips C2 right now — preview using largest-spend campaign for wording verification only)\n`
      );
      console.log(
        `— ${c.campaign_name}  (Meta purchases=${a.purchases}, real orders=${ord.orders})`
      );
      console.log(
        buildTrackingGapAction({
          campaignName: c.campaign_name,
          metaPurchases: a.purchases,
          realOrders: ord.orders,
        })
      );
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
