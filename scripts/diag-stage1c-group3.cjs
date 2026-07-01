/* eslint-disable */
// Sprint 6.5 / 1c / Group 3 verification: prints recommendedAction text
// for M1 / M2 / C1 / A1 / AD1 against live snapshot data.
//
// Run:
//   node scripts/diag-stage1c-group3.cjs <project_id>
//
// Read-only. Inlines the exact templates from src/server/decisions/rules.ts
// so the preview matches production wording. Predicates mirror TUNING.

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const T = {
  revenueUndershootWarning: 0.8,
  revenueUndershootCritical: 0.5,
  roasCriticalMultiplier: 0.5,
  campaignSpendSignificance: 0.1,
  campaignSpendCriticalShare: 0.2,
  adsetSpendShare: 0.05,
  adsetWeakRatio: 0.5,
  adOpportunityRoasMultiplier: 1.5,
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
function round2(v) {
  return Math.round(v * 100) / 100;
}
function pluralUa(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

// -- exact clones of the rule-side templates --

function buildRevenueUndershootAction(a) {
  const revenue = round2(a.realRevenue);
  const target = round2(a.proRatedTarget);
  const pct = Math.round(a.ratio * 100);
  return [
    `Діагноз: на день ${a.dayOfMonth} real-виторг ${revenue} — це ${pct}% планового темпу (пропорційна ціль ${target}). Real-виторг відстає.`,
    `Задача:`,
    `1. Проаналізуй топ-2-3 кампанії за real ROAS — знайди найприбутковіші.`,
    `2. Масштабуй їх (підніми бюджет на найкращі).`,
    `3. Перевір чи слабкі кампанії не з'їдають бюджет даремно.`,
  ].join("\n");
}
function buildRoasFloorAction(a) {
  const r = round2(a.realRoas).toFixed(2);
  const t = round2(a.targetRoas).toFixed(2);
  return [
    `Діагноз: real ROAS ×${r} нижче цільового ×${t}. Реклама не окуповується на потрібному рівні.`,
    `Задача:`,
    `1. Знайди кампанії/адсети з real ROAS нижче цілі — вони тягнуть середнє.`,
    `2. Перерозподіли бюджет з них на прибуткові.`,
    `3. Якщо real ROAS підозріло низький при добрих Meta-показниках — спершу перевір трекінг (мітки/події).`,
  ].join("\n");
}
function buildBurnedBudgetAction(a) {
  const spend = round2(a.spend);
  const share = Math.round(a.share * 100);
  const days =
    a.hasAdStartDate && a.daysRunning !== null
      ? ` (працює ${a.daysRunning} ${pluralUa(a.daysRunning, "день", "дні", "днів")})`
      : "";
  return [
    `Діагноз: кампанія «${a.campaignName}» витратила ${spend} без жодного підтвердженого real-продажу${days}. Це ≈${share}% місячного бюджету.`,
    `Задача:`,
    `1. Перевір UTM цієї кампанії на тестовій заявці — можливо продажі є, але не трекаються.`,
    `2. Якщо трекінг цілий і продажів справді нема — постав на паузу, звільни ≈${share}% бюджету на прибуткові кампанії.`,
  ].join("\n");
}
function buildAdsetWeakLinkAction(a) {
  const r = round2(a.adsetRoas).toFixed(2);
  const avg = round2(a.avgRoas).toFixed(2);
  const cc = a.campaignName ? ` у кампанії «${a.campaignName}»` : "";
  return [
    `Діагноз: адсет «${a.adsetName}»${cc} має real ROAS ×${r} проти ×${avg} по кампанії — тягне середню окупність вниз.`,
    `Задача:`,
    `1. Зменш бюджет цього адсета або вимкни його.`,
    `2. Перелий бюджет на сильніші адсети цієї кампанії.`,
  ].join("\n");
}
function buildAdOpportunityAction(a) {
  const r = round2(a.realRoas).toFixed(2);
  return [
    `Діагноз: оголошення «${a.adName}» — найкращий real ROAS ×${r} серед оголошень. Є запас для масштабування.`,
    `Задача: Відкрий це оголошення в розділі Meta Ads — там повний покроковий рецепт масштабування (винести в окрему кампанію, нові креативи, тест 2-3 дні).`,
  ].join("\n");
}

function thisMonthUtc() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const t = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return { since: iso(s), until: iso(t), dayOfMonth: now.getUTCDate(), daysInMonth };
}

function deriveRuntime(raw) {
  if (!raw) return { startDate: null, daysRunning: null };
  const p = new Date(raw);
  if (Number.isNaN(p.getTime())) return { startDate: null, daysRunning: null };
  const s = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate());
  const now = new Date();
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 24 * 60 * 60 * 1000;
  return {
    startDate: new Date(s).toISOString().slice(0, 10),
    daysRunning: Math.max(0, Math.floor((t - s) / day)),
  };
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: node scripts/diag-stage1c-group3.cjs <project_id>");
    process.exit(1);
  }
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ADMIN_KEY;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { since, until, dayOfMonth, daysInMonth } = thisMonthUtc();

  const { data: proj } = await admin
    .from("projects")
    .select("user_id, name, target_roas, target_cpa, monthly_revenue_goal, monthly_ad_budget")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) throw new Error("project not found");
  const targetRoas = n(proj.target_roas);
  const targetRevenue = n(proj.monthly_revenue_goal);
  const proRatedTarget = targetRevenue > 0 ? targetRevenue * (dayOfMonth / daysInMonth) : 0;

  const { data: bindings } = await admin
    .from("project_meta_ad_accounts")
    .select("meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )")
    .eq("project_id", projectId)
    .eq("status", "active");
  const aaUuids = [];
  for (const b of bindings || []) {
    const bm = b.project_meta_business_managers;
    const conn = bm && bm.meta_connections;
    if (!bm || bm.status !== "active" || !conn || conn.status !== "active") continue;
    if (b.meta_ad_account_id) aaUuids.push(b.meta_ad_account_id);
  }

  // Campaigns + created_time.
  const { data: campaigns } = await admin
    .from("meta_campaigns")
    .select("id, campaign_name, created_time")
    .in("meta_ad_account_id", aaUuids);
  const cIds = (campaigns || []).map((c) => c.id);
  const campaignById = new Map((campaigns || []).map((c) => [c.id, c]));

  // Adsets.
  const { data: adsets } = await admin
    .from("meta_adsets")
    .select("id, adset_name, meta_campaign_id_fk")
    .in("meta_campaign_id_fk", cIds);
  const asIds = (adsets || []).map((a) => a.id);

  // Insights aggregators.
  async function agg(table, fk, ids) {
    if (!ids.length) return new Map();
    const { data } = await admin
      .from(table)
      .select(`${fk}, spend, revenue, purchases`)
      .gte("date", since)
      .lte("date", until)
      .in(fk, ids);
    const m = new Map();
    for (const r of data || []) {
      if (!r[fk]) continue;
      const a = m.get(r[fk]) || { spend: 0, revenue: 0, purchases: 0 };
      a.spend += n(r.spend);
      a.revenue += n(r.revenue);
      a.purchases += n(r.purchases);
      m.set(r[fk], a);
    }
    return m;
  }
  const cIns = await agg("meta_campaign_insights", "meta_campaign_id_fk", cIds);
  const asIns = await agg("meta_adset_insights", "meta_adset_id_fk", asIds);

  // AA insights → totals (mirror snapshot behaviour).
  const { data: aaIns } = await admin
    .from("meta_ad_account_insights")
    .select("spend, revenue, purchases")
    .eq("user_id", proj.user_id)
    .gte("date", since)
    .lte("date", until)
    .in("meta_ad_account_id_fk", aaUuids);
  let totalSpend = 0, totalMetaRevenue = 0, totalPurchases = 0;
  for (const r of aaIns || []) {
    totalSpend += n(r.spend);
    totalMetaRevenue += n(r.revenue);
    totalPurchases += n(r.purchases);
  }

  // Orders.
  const { data: orders } = await admin
    .from("orders")
    .select("revenue, matched_meta_campaign_id, matched_meta_adset_id")
    .eq("user_id", proj.user_id)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);
  let totalRealRevenue = 0;
  const ordByC = new Map(), ordByAS = new Map();
  for (const o of orders || []) {
    const rev = n(o.revenue);
    totalRealRevenue += rev;
    if (o.matched_meta_campaign_id) {
      const b = ordByC.get(o.matched_meta_campaign_id) || { revenue: 0, orders: 0 };
      b.revenue += rev; b.orders += 1;
      ordByC.set(o.matched_meta_campaign_id, b);
    }
    if (o.matched_meta_adset_id) {
      const b = ordByAS.get(o.matched_meta_adset_id) || { revenue: 0, orders: 0 };
      b.revenue += rev; b.orders += 1;
      ordByAS.set(o.matched_meta_adset_id, b);
    }
  }
  const totalRealRoas = totalSpend > 0 ? totalRealRevenue / totalSpend : null;

  // hasAdStartDate mirror: at least one ad row with startDate.
  const { data: ads } = await admin
    .from("meta_ads")
    .select("created_time, meta_adset_id_fk")
    .in("meta_adset_id_fk", asIds);
  const hasAdStartDate = (ads || []).some((a) => a.created_time !== null);

  console.log(`\nProject: ${proj.name} (${projectId})`);
  console.log(
    `dayOfMonth=${dayOfMonth}/${daysInMonth}  spend=${totalSpend.toFixed(2)}  ` +
      `realRevenue=${totalRealRevenue.toFixed(2)}  ` +
      `realRoas=${totalRealRoas !== null ? totalRealRoas.toFixed(2) : "null"}  ` +
      `targetRoas=${targetRoas}  targetRevenue=${targetRevenue}  hasAdStartDate=${hasAdStartDate}`
  );

  // === M1 ===
  console.log("\n=== M1 (revenue undershoot) ===");
  if (proRatedTarget <= 0) {
    console.log("(inactive — targetRevenue not set)");
  } else {
    const ratio = totalRealRevenue / proRatedTarget;
    if (ratio >= T.revenueUndershootWarning) {
      console.log(`(does not fire — ratio=${ratio.toFixed(2)} ≥ ${T.revenueUndershootWarning})`);
    } else {
      console.log(
        buildRevenueUndershootAction({
          dayOfMonth,
          realRevenue: totalRealRevenue,
          proRatedTarget,
          ratio,
        })
      );
    }
  }

  // === M2 ===
  console.log("\n=== M2 (real ROAS floor) ===");
  if (targetRoas <= 0) console.log("(inactive — targetRoas not set)");
  else if (totalRealRoas === null) console.log("(inactive — spend=0)");
  else if (totalRealRoas >= targetRoas * T.roasCriticalMultiplier) {
    console.log(`(does not fire — realRoas=${totalRealRoas.toFixed(2)} ≥ target×${T.roasCriticalMultiplier})`);
  } else {
    console.log(
      buildRoasFloorAction({ realRoas: totalRealRoas, targetRoas })
    );
  }

  // === C1 ===
  console.log("\n=== C1 (burned budget) ===");
  let c1Fired = 0;
  for (const c of campaigns || []) {
    const ins = cIns.get(c.id);
    if (!ins || ins.spend <= 0) continue;
    const ord = ordByC.get(c.id);
    if (ord && ord.orders > 0) continue;
    const share = totalSpend > 0 ? ins.spend / totalSpend : 0;
    if (share < T.campaignSpendSignificance) continue;
    c1Fired++;
    const { daysRunning } = deriveRuntime(c.created_time);
    console.log(
      `\n— ${c.campaign_name}  (spend=${ins.spend.toFixed(2)}, share=${(share * 100).toFixed(0)}%, daysRunning=${daysRunning})`
    );
    console.log(
      buildBurnedBudgetAction({
        campaignName: c.campaign_name,
        spend: ins.spend,
        share,
        daysRunning,
        hasAdStartDate,
      })
    );
  }
  if (c1Fired === 0) console.log("(no campaign trips C1)");

  // === A1 ===
  console.log("\n=== A1 (adset weak link) ===");
  const byCampaign = new Map();
  for (const a of adsets || []) {
    const ins = asIns.get(a.id);
    if (!ins) continue;
    const ord = ordByAS.get(a.id);
    const realRoas = ins.spend > 0 ? (ord?.revenue ?? 0) / ins.spend : null;
    if (!a.meta_campaign_id_fk) continue;
    const arr = byCampaign.get(a.meta_campaign_id_fk) || [];
    arr.push({
      id: a.id, name: a.adset_name, spend: ins.spend,
      realRoas, realOrders: ord?.orders ?? 0,
    });
    byCampaign.set(a.meta_campaign_id_fk, arr);
  }
  let a1Fired = 0;
  for (const [cid, list] of byCampaign) {
    const scored = list.filter((x) => x.realRoas !== null);
    if (scored.length < 2) continue;
    const avg = scored.reduce((s, x) => s + x.realRoas, 0) / scored.length;
    if (avg <= 0) continue;
    const worst = scored.reduce((acc, x) => (x.realRoas < acc.realRoas ? x : acc), scored[0]);
    if (totalSpend > 0 && worst.spend / totalSpend < T.adsetSpendShare) continue;
    if (worst.realRoas >= avg * T.adsetWeakRatio) continue;
    a1Fired++;
    const campName = campaignById.get(cid)?.campaign_name ?? null;
    console.log(`\n— ${worst.name}  (roas=${worst.realRoas.toFixed(2)} avg=${avg.toFixed(2)})`);
    console.log(
      buildAdsetWeakLinkAction({
        adsetName: worst.name,
        campaignName: campName,
        adsetRoas: worst.realRoas,
        avgRoas: avg,
      })
    );
  }
  if (a1Fired === 0) console.log("(no adset trips A1)");

  // === AD1 ===
  console.log("\n=== AD1 (best ad opportunity) ===");
  // Need ad-level insights + real revenue.
  const adIds = (ads || []).map((a) => a && a.id).filter(Boolean);
  const adRowsById = new Map((ads || []).map((a) => [a.id, a]));
  const adIns = await agg("meta_ad_insights", "meta_ad_id_fk", adIds);
  const { data: adOrders } = await admin
    .from("orders")
    .select("revenue, matched_meta_ad_id")
    .eq("user_id", proj.user_id)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);
  const ordByAd = new Map();
  for (const o of adOrders || []) {
    if (!o.matched_meta_ad_id) continue;
    const b = ordByAd.get(o.matched_meta_ad_id) || { revenue: 0, orders: 0 };
    b.revenue += n(o.revenue); b.orders += 1;
    ordByAd.set(o.matched_meta_ad_id, b);
  }
  // Fetch ad names.
  let adNames = new Map();
  if (adIds.length > 0) {
    const { data: adRows } = await admin
      .from("meta_ads")
      .select("id, ad_name")
      .in("id", adIds);
    adNames = new Map((adRows || []).map((a) => [a.id, a.ad_name]));
  }
  const adCandidates = [];
  for (const [adId, ins] of adIns) {
    if (ins.spend <= 0) continue;
    const ord = ordByAd.get(adId);
    if (!ord || ord.revenue <= 0) continue;
    const realRoas = ord.revenue / ins.spend;
    if (realRoas <= 0) continue;
    adCandidates.push({ id: adId, name: adNames.get(adId), realRoas });
  }
  if (adCandidates.length === 0) {
    console.log("(no ad candidate — need at least one with realRoas > 0)");
  } else if (targetRoas <= 0) {
    console.log("(inactive — targetRoas not set)");
  } else {
    const best = adCandidates.reduce((acc, a) => (a.realRoas > acc.realRoas ? a : acc), adCandidates[0]);
    if (best.realRoas < targetRoas * T.adOpportunityRoasMultiplier) {
      console.log(`(does not fire — best realRoas=${best.realRoas.toFixed(2)} < target×${T.adOpportunityRoasMultiplier})`);
    } else {
      console.log(
        buildAdOpportunityAction({ adName: best.name, realRoas: best.realRoas })
      );
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
