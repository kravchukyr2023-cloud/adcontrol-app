/* eslint-disable */
// Sprint 6.5 / 1c / Group 2 verification: for a project, walk every
// campaign / adset / ad and print whether the scale-recipe fires + the
// text.
//
// Run:
//   node scripts/diag-stage1c-group2.cjs <project_id>
//
// Read-only. Inlines the exact guards + templates from
// src/lib/decisions/entity-diagnosis.ts:buildScaleRecipe so the preview
// matches production wording verbatim. Numbers come from live snapshot
// aggregates (spend / meta-purchases / real-orders MTD).

const path = require("path");
const fs = require("fs");
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

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// EXACT clone of buildScaleRecipe from src/lib/decisions/entity-diagnosis.ts.
function buildScaleRecipe(entity, ctx) {
  if (entity.realOrders <= 0) return null;
  if (entity.realRoas === null || !Number.isFinite(entity.realRoas)) return null;
  if (ctx.targetRoas > 0 && entity.realRoas < ctx.targetRoas) return null;
  if (!isTopByRealRoas(entity, ctx.peers)) return null;
  const roasStr = `×${round2(entity.realRoas).toFixed(2)}`;
  if (entity.level === "ad") {
    const parentClause = ctx.parentCampaignName
      ? ` кампанії «${ctx.parentCampaignName}»`
      : "";
    return (
      `Це найкраще оголошення${parentClause} — real ROAS ${roasStr}. ` +
      `Рекомендую взяти зв'язку адсет + оголошення та винести в окрему кампанію ` +
      `для тесту, додати нові креативи створені на основі цього оголошення, ` +
      `і протестувати 2-3 дні.`
    );
  }
  if (entity.level === "adset") {
    const w = plural(entity.realOrders, "real-продаж", "real-продажі", "real-продажів");
    return (
      `Цей адсет дає найкращу результативність — ${entity.realOrders} ${w}, ` +
      `real ROAS ${roasStr}, найкраще серед усіх адсетів. Рекомендую зберегти ` +
      `цю аудиторію, проаналізувати її креативи, створити нові на їх основі та ` +
      `запустити окремою кампанією тільки з цією аудиторією. Тест 2-3 дні.`
    );
  }
  // campaign
  const bestAd = pickBestChildAd(ctx.childAds);
  const adClause = bestAd
    ? ` — «${bestAd.name}» (ROAS ×${round2(bestAd.realRoas).toFixed(2)})`
    : "";
  return (
    `Це найкраща кампанія за real ROAS ${roasStr}. Рекомендую проаналізувати ` +
    `її найкраще оголошення${adClause} і створити нові креативи на його основі.`
  );
}

function isTopByRealRoas(entity, peers) {
  if (entity.realRoas === null) return false;
  const candidates = peers.filter(
    (p) =>
      p.level === entity.level &&
      p.realRoas !== null &&
      Number.isFinite(p.realRoas) &&
      p.realOrders > 0
  );
  if (candidates.length === 0) return false;
  for (const p of candidates) {
    if (p.id === entity.id) continue;
    if (p.realRoas > entity.realRoas) return false;
    if (p.realRoas === entity.realRoas && p.realRevenue > entity.realRevenue)
      return false;
  }
  return true;
}

function pickBestChildAd(childAds) {
  let best = null;
  for (const ad of childAds) {
    if (ad.realRoas === null || !Number.isFinite(ad.realRoas)) continue;
    if (ad.realOrders <= 0) continue;
    if (best === null || ad.realRoas > best.realRoas) best = ad;
  }
  return best;
}

function thisMonthUtc() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { since: iso(s), until: iso(t) };
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: node scripts/diag-stage1c-group2.cjs <project_id>");
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

  const { data: proj } = await admin
    .from("projects")
    .select("user_id, name, target_roas")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) throw new Error("project not found");
  const targetRoas = n(proj.target_roas);

  const { data: bindings } = await admin
    .from("project_meta_ad_accounts")
    .select("meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )")
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

  // Campaigns.
  const { data: campaigns } = await admin
    .from("meta_campaigns")
    .select("id, campaign_name")
    .in("meta_ad_account_id", aaUuids);
  const campaignById = new Map((campaigns || []).map((c) => [c.id, c]));
  const cIds = (campaigns || []).map((c) => c.id);

  // Adsets.
  const { data: adsets } = await admin
    .from("meta_adsets")
    .select("id, adset_name, meta_campaign_id_fk")
    .in("meta_campaign_id_fk", cIds);
  const adsetById = new Map((adsets || []).map((a) => [a.id, a]));
  const asIds = (adsets || []).map((a) => a.id);

  // Ads.
  const { data: ads } = await admin
    .from("meta_ads")
    .select("id, ad_name, meta_adset_id_fk")
    .in("meta_adset_id_fk", asIds);
  const adById = new Map((ads || []).map((a) => [a.id, a]));
  const adIds = (ads || []).map((a) => a.id);

  // Insights aggregates.
  async function aggInsights(table, fkCol, ids) {
    if (ids.length === 0) return new Map();
    const { data } = await admin
      .from(table)
      .select(`${fkCol}, spend, purchases, revenue`)
      .gte("date", since)
      .lte("date", until)
      .in(fkCol, ids);
    const m = new Map();
    for (const r of data || []) {
      const id = r[fkCol];
      if (!id) continue;
      const a = m.get(id) || { spend: 0, purchases: 0, revenue: 0 };
      a.spend += n(r.spend);
      a.purchases += n(r.purchases);
      a.revenue += n(r.revenue);
      m.set(id, a);
    }
    return m;
  }
  const cIns = await aggInsights("meta_campaign_insights", "meta_campaign_id_fk", cIds);
  const asIns = await aggInsights("meta_adset_insights", "meta_adset_id_fk", asIds);
  const adIns = await aggInsights("meta_ad_insights", "meta_ad_id_fk", adIds);

  // Orders.
  const { data: orders } = await admin
    .from("orders")
    .select("revenue, matched_meta_campaign_id, matched_meta_adset_id, matched_meta_ad_id")
    .eq("user_id", proj.user_id)
    .eq("project_id", projectId)
    .gte("order_date", since)
    .lte("order_date", until);
  const bucket = (map, id, rev) => {
    const b = map.get(id) || { revenue: 0, orders: 0 };
    b.revenue += rev;
    b.orders += 1;
    map.set(id, b);
  };
  const ordByCampaign = new Map();
  const ordByAdset = new Map();
  const ordByAd = new Map();
  for (const o of orders || []) {
    const rev = n(o.revenue);
    if (o.matched_meta_campaign_id) bucket(ordByCampaign, o.matched_meta_campaign_id, rev);
    if (o.matched_meta_adset_id) bucket(ordByAdset, o.matched_meta_adset_id, rev);
    if (o.matched_meta_ad_id) bucket(ordByAd, o.matched_meta_ad_id, rev);
  }

  function toEP(row, level, insMap, ordMap, parents) {
    const ins = insMap.get(row.id) || { spend: 0, revenue: 0, purchases: 0 };
    const ord = ordMap.get(row.id) || { revenue: 0, orders: 0 };
    return {
      id: row.id,
      name:
        row.campaign_name || row.adset_name || row.ad_name || "(unnamed)",
      level,
      spend: ins.spend,
      realOrders: ord.orders,
      realRevenue: ord.revenue,
      realRoas: ins.spend > 0 ? ord.revenue / ins.spend : null,
      parentCampaignId: parents?.parentCampaignId ?? null,
    };
  }

  const campaignEPs = (campaigns || [])
    .map((c) => toEP(c, "campaign", cIns, ordByCampaign, {}))
    .filter((e) => e.spend > 0 || e.realOrders > 0);
  const adsetEPs = (adsets || [])
    .map((a) => toEP(a, "adset", asIns, ordByAdset, { parentCampaignId: a.meta_campaign_id_fk }))
    .filter((e) => e.spend > 0 || e.realOrders > 0);
  const adEPs = (ads || [])
    .map((a) => {
      const parentAdset = adsetById.get(a.meta_adset_id_fk);
      return toEP(a, "ad", adIns, ordByAd, {
        parentCampaignId: parentAdset?.meta_campaign_id_fk ?? null,
      });
    })
    .filter((e) => e.spend > 0 || e.realOrders > 0);

  console.log(`\nProject: ${proj.name} (${projectId})`);
  console.log(`Target ROAS: ${targetRoas || "(not set)"}`);
  console.log(
    `Entities with activity — campaigns=${campaignEPs.length} ` +
      `adsets=${adsetEPs.length} ads=${adEPs.length}`
  );

  function walk(label, list, peers, extraCtx) {
    console.log(`\n=== ${label} ===`);
    let printed = 0;
    for (const e of list) {
      const parentCampaignName =
        e.level === "ad" && e.parentCampaignId
          ? campaignById.get(e.parentCampaignId)?.campaign_name ?? null
          : null;
      const childAds =
        e.level === "campaign"
          ? adEPs.filter((a) => a.parentCampaignId === e.id)
          : [];
      const recipe = buildScaleRecipe(e, {
        targetRoas,
        peers,
        parentCampaignName,
        childAds,
      });
      if (!recipe) continue;
      printed++;
      console.log(
        `\n— ${e.name}  (realRoas=${round2(e.realRoas).toFixed(2)}, orders=${e.realOrders})`
      );
      console.log(recipe);
    }
    if (printed === 0) {
      const top = [...list]
        .filter((e) => e.realRoas !== null && e.realOrders > 0)
        .sort((a, b) => (b.realRoas ?? 0) - (a.realRoas ?? 0))[0];
      if (top) {
        console.log(
          `(no winner qualified. Top real-ROAS candidate: ${top.name} ` +
            `— realRoas=${round2(top.realRoas).toFixed(2)}, orders=${top.realOrders}, ` +
            `target=${targetRoas || "n/a"}. ` +
            (targetRoas > 0 && top.realRoas < targetRoas
              ? "Below target."
              : "Passed target — likely not top of level.")
        );
      } else {
        console.log("(no entity has real orders + defined ROAS this month)");
      }
    }
  }

  walk("Campaigns", campaignEPs, campaignEPs);
  walk("Adsets", adsetEPs, adsetEPs);
  walk("Ads", adEPs, adEPs);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
