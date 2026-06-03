/* eslint-disable */
// One-off simulation of GET /api/meta/analytics — mirrors the route logic
// (project isolation + filter resolution + delivery-based inclusion).
//
// Usage:
//   node scripts/test-analytics.cjs
//   BM_ID=2149130375348387 node scripts/test-analytics.cjs
//   AD_ACCOUNT_ID=act_869118064714884 node scripts/test-analytics.cjs

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

const USER_ID = process.env.USER_ID || "de19f80c-91c0-4d41-85a7-d171d1675ed9";
const PROJECT_ID =
  process.env.PROJECT_ID || "4509a1e6-a14d-4f2e-8c14-d67258b0a84b";
const BM_ID = process.env.BM_ID || null;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID || null;

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}
function monthToDate() {
  const today = new Date();
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  );
  return { since: toIsoDate(monthStart), until: toIsoDate(today) };
}

// Mirrors presetToRange() in src/app/(platform)/meta/page.tsx
function presetToRange(preset) {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  switch (preset) {
    case "today":
      return { since: toIsoDate(today), until: toIsoDate(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      return { since: toIsoDate(y), until: toIsoDate(y) };
    }
    case "last_7_days": {
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 6);
      return { since: toIsoDate(s), until: toIsoDate(today) };
    }
    case "this_month": {
      const s = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      );
      return { since: toIsoDate(s), until: toIsoDate(today) };
    }
    case "last_month": {
      const s = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      );
      const e = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)
      );
      return { since: toIsoDate(s), until: toIsoDate(e) };
    }
    case "last_30_days": {
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 29);
      return { since: toIsoDate(s), until: toIsoDate(today) };
    }
    default:
      return monthToDate();
  }
}
function parseNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function parseNumOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function deriveRates(s) {
  return {
    ctr: s.impressions > 0 ? (s.clicks / s.impressions) * 100 : null,
    cpc: s.clicks > 0 ? s.spend / s.clicks : null,
    cpm: s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null,
    roas: s.revenue !== null && s.spend > 0 ? s.revenue / s.spend : null,
  };
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const mtd = monthToDate();
  let since = process.env.SINCE || mtd.since;
  let until = process.env.UNTIL || mtd.until;
  if (process.env.PRESET) {
    const r = presetToRange(process.env.PRESET);
    since = process.env.SINCE || r.since;
    until = process.env.UNTIL || r.until;
  }

  // 1. Active selections.
  const { data: selections } = await sb
    .from("project_meta_ad_accounts")
    .select("meta_ad_account_id, project_meta_business_manager_id")
    .eq("user_id", USER_ID)
    .eq("project_id", PROJECT_ID)
    .eq("status", "active");

  const aaRowIds = [
    ...new Set((selections || []).map((s) => s.meta_ad_account_id)),
  ];
  const bmMembershipIds = [
    ...new Set(
      (selections || []).map((s) => s.project_meta_business_manager_id)
    ),
  ];

  if (aaRowIds.length === 0) {
    return printResult([], emptyCampaigns(), {
      since,
      until,
      bm: BM_ID,
      aa: AD_ACCOUNT_ID,
    });
  }

  // 1a. AA metadata.
  const { data: aaRows } = await sb
    .from("meta_ad_accounts")
    .select(
      "id, meta_ad_account_id, ad_account_name, currency, status, meta_account_status_code"
    )
    .eq("user_id", USER_ID)
    .in("id", aaRowIds);
  const aaRowById = new Map((aaRows || []).map((a) => [a.id, a]));

  // 1b. Active BM memberships.
  const { data: bmMemberships } = await sb
    .from("project_meta_business_managers")
    .select("id, meta_business_manager_id, status")
    .eq("user_id", USER_ID)
    .in("id", bmMembershipIds);
  const activeMemberships = (bmMemberships || []).filter(
    (m) => m.status === "active"
  );
  const membershipById = new Map(activeMemberships.map((m) => [m.id, m]));

  // 1c. meta_business_managers (text bm_id).
  const metaBmRowIds = [
    ...new Set(activeMemberships.map((m) => m.meta_business_manager_id)),
  ];
  let bmRowsList = [];
  if (metaBmRowIds.length > 0) {
    const { data: bmRows } = await sb
      .from("meta_business_managers")
      .select("id, meta_bm_id")
      .eq("user_id", USER_ID)
      .in("id", metaBmRowIds);
    bmRowsList = bmRows || [];
  }
  const bmRowById = new Map(bmRowsList.map((b) => [b.id, b]));

  // Build AA infos.
  const aaInfos = [];
  const seen = new Set();
  for (const sel of selections || []) {
    if (seen.has(sel.meta_ad_account_id)) continue;
    const aa = aaRowById.get(sel.meta_ad_account_id);
    if (!aa) continue;
    const m = membershipById.get(sel.project_meta_business_manager_id);
    const bm = m ? bmRowById.get(m.meta_business_manager_id) : null;
    aaInfos.push({
      uuid: aa.id,
      text_id: aa.meta_ad_account_id,
      ad_account_name: aa.ad_account_name,
      currency: aa.currency,
      status: aa.status,
      account_status_code: aa.meta_account_status_code,
      bm_text_id: bm ? bm.meta_bm_id : null,
    });
    seen.add(sel.meta_ad_account_id);
  }

  // 2. Apply filters.
  let scopedAas;
  if (AD_ACCOUNT_ID) {
    scopedAas = aaInfos.filter((a) => a.text_id === AD_ACCOUNT_ID);
  } else if (BM_ID) {
    scopedAas = aaInfos.filter((a) => a.bm_text_id === BM_ID);
  } else {
    scopedAas = aaInfos;
  }

  if (scopedAas.length === 0) {
    return printResult([], emptyCampaigns(), {
      since,
      until,
      bm: BM_ID,
      aa: AD_ACCOUNT_ID,
    });
  }

  const scopedAaUuids = scopedAas.map((a) => a.uuid);

  // 3. Summary.
  const { data: aaIns } = await sb
    .from("meta_ad_account_insights")
    .select("spend, impressions, clicks, purchases, revenue")
    .eq("user_id", USER_ID)
    .in("meta_ad_account_id_fk", scopedAaUuids)
    .gte("date", since)
    .lte("date", until);

  const sum = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    revenue: 0,
    hasRevenue: false,
  };
  for (const r of aaIns || []) {
    sum.spend += parseNum(r.spend);
    sum.impressions += parseNum(r.impressions);
    sum.clicks += parseNum(r.clicks);
    sum.purchases += parseNum(r.purchases);
    const rev = parseNumOrNull(r.revenue);
    if (rev !== null) {
      sum.revenue += rev;
      sum.hasRevenue = true;
    }
  }

  // 4. Campaigns (any status).
  const { data: cRows } = await sb
    .from("meta_campaigns")
    .select(
      "id, meta_campaign_id, campaign_name, effective_status, objective, status"
    )
    .eq("user_id", USER_ID)
    .in("meta_ad_account_id", scopedAaUuids);

  // 5. Campaign delivery aggregate.
  const cAgg = new Map();
  if ((cRows || []).length > 0) {
    const ids = cRows.map((c) => c.meta_campaign_id);
    const { data: ci } = await sb
      .from("meta_campaign_insights")
      .select(
        "meta_campaign_id, spend, impressions, clicks, purchases, revenue"
      )
      .eq("user_id", USER_ID)
      .in("meta_campaign_id", ids)
      .gte("date", since)
      .lte("date", until);
    for (const r of ci || []) {
      const id = String(r.meta_campaign_id);
      let a = cAgg.get(id);
      if (!a) {
        a = {
          spend: 0,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          revenue: 0,
          hasRevenue: false,
        };
        cAgg.set(id, a);
      }
      a.spend += parseNum(r.spend);
      a.impressions += parseNum(r.impressions);
      a.clicks += parseNum(r.clicks);
      a.purchases += parseNum(r.purchases);
      const rev = parseNumOrNull(r.revenue);
      if (rev !== null) {
        a.revenue += rev;
        a.hasRevenue = true;
      }
    }
  }

  // 6. Filter campaigns.
  const includedCampaigns = (cRows || []).filter((c) => {
    const activeOrPaused = c.status === "active" || c.status === "paused";
    const a = cAgg.get(c.meta_campaign_id);
    const hadDelivery =
      a && (a.spend > 0 || a.impressions > 0 || a.clicks > 0 || a.purchases > 0);
    return activeOrPaused || hadDelivery;
  });

  printResult(scopedAas, { rows: includedCampaigns, agg: cAgg, sum }, {
    since,
    until,
    bm: BM_ID,
    aa: AD_ACCOUNT_ID,
  });
}

function emptyCampaigns() {
  return {
    rows: [],
    agg: new Map(),
    sum: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      revenue: 0,
      hasRevenue: false,
    },
  };
}

function printResult(scopedAas, c, opts) {
  console.log(`# Analytics simulation`);
  console.log(`  date range : ${opts.since} → ${opts.until}`);
  console.log(`  bm_id      : ${opts.bm ?? "(none)"}`);
  console.log(`  ad_account : ${opts.aa ?? "(none)"}`);
  console.log(`  ----`);
  console.log(`  selected AA count : ${scopedAas.length}`);
  for (const a of scopedAas) {
    console.log(
      `    - ${a.text_id.padEnd(22)} bm=${a.bm_text_id ?? "—"} currency=${a.currency} name="${a.ad_account_name ?? ""}"`
    );
  }
  console.log(`  campaign count    : ${c.rows.length}`);
  console.log(`  spend             : ${c.sum.spend.toFixed(2)}`);
  console.log(`  purchases         : ${c.sum.purchases}`);
  console.log(`  impressions       : ${c.sum.impressions}`);
  console.log(`  clicks            : ${c.sum.clicks}`);
  if (c.rows.length > 0) {
    console.log(`  ----`);
    console.log(`  campaign sample:`);
    for (const camp of c.rows.slice(0, 6)) {
      const a = c.agg.get(camp.meta_campaign_id) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
      };
      console.log(
        `    [${camp.status.padEnd(7)}] [${(camp.effective_status || "—").padEnd(14)}] spend=${a.spend
          .toFixed(2)
          .padStart(8)} imp=${String(a.impressions).padStart(7)} purch=${String(a.purchases).padStart(4)}  ${camp.campaign_name}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
