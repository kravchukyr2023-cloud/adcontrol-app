/* eslint-disable */
// Diagnostic only. Does NOT call /api/meta/analytics. Reads the same DB
// tables the route reads and prints per-level (account/campaign/adset/ad)
// totals + row counts + date ranges so cross-level drift is visible.
//
// Use this to narrow down where purchases / spend / metrics diverge:
//   A) all 4 levels agree, totals match expectations   → pipeline OK
//   B) account-level differs from campaign/adset/ad    → meta returns
//      different action set per level (normalization gap)
//   C) campaign-level == adset == ad but ≠ account     → account-level
//      attribution scope differs
//   D) rows missing for a level                        → sync gap
//   E) max_date < today                                → stale sync
//
// Usage:
//   node scripts/reconcile-meta-analytics.cjs
//   PRESET=today AA=act_869118064714884 node scripts/reconcile-meta-analytics.cjs

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

const PRESETS_TO_RUN = process.env.PRESET
  ? [process.env.PRESET]
  : ["today", "yesterday", "last_7_days", "this_month", "last_30_days"];

const AAS_TO_RUN = process.env.AA
  ? [process.env.AA]
  : ["act_869118064714884", "act_763823124391032"];

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

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
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { since: toIsoDate(s), until: toIsoDate(today) };
    }
    case "last_30_days": {
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 29);
      return { since: toIsoDate(s), until: toIsoDate(today) };
    }
    default:
      throw new Error("unknown preset " + preset);
  }
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function aggregate(rows) {
  if (!rows || rows.length === 0) {
    return {
      rows: 0,
      minDate: null,
      maxDate: null,
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
    };
  }
  let spend = 0,
    impressions = 0,
    clicks = 0,
    purchases = 0;
  let minDate = rows[0].date;
  let maxDate = rows[0].date;
  for (const r of rows) {
    spend += num(r.spend);
    impressions += num(r.impressions);
    clicks += num(r.clicks);
    purchases += num(r.purchases);
    if (r.date < minDate) minDate = r.date;
    if (r.date > maxDate) maxDate = r.date;
  }
  return {
    rows: rows.length,
    minDate,
    maxDate,
    spend,
    impressions,
    clicks,
    purchases,
  };
}

async function fetchAllInChunks(sb, table, params, idColumn, ids, since, until) {
  // Supabase URLs cap query length; chunk large id lists.
  const out = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let q = sb
      .from(table)
      .select("date, spend, impressions, clicks, purchases")
      .eq("user_id", USER_ID)
      .gte("date", since)
      .lte("date", until)
      .in(idColumn, slice);
    const { data, error } = await q;
    if (error) throw new Error(`${table} chunk ${i}: ${error.message}`);
    for (const r of data || []) out.push(r);
  }
  return out;
}

async function reconcileOne(sb, aaTextId, preset) {
  const { since, until } = presetToRange(preset);

  // 1. Resolve AA uuid + name.
  const { data: aaRow, error: aaErr } = await sb
    .from("meta_ad_accounts")
    .select("id, ad_account_name")
    .eq("user_id", USER_ID)
    .eq("meta_ad_account_id", aaTextId)
    .maybeSingle();
  if (aaErr || !aaRow) {
    console.log(`  !! AA ${aaTextId} not found for user`);
    return;
  }
  const aaUuid = aaRow.id;
  const aaName = aaRow.ad_account_name;

  // 2. Account-level insights — filter by FK.
  const { data: accRows } = await sb
    .from("meta_ad_account_insights")
    .select("date, spend, impressions, clicks, purchases")
    .eq("user_id", USER_ID)
    .eq("meta_ad_account_id_fk", aaUuid)
    .gte("date", since)
    .lte("date", until);
  const account = aggregate(accRows || []);

  // 3. Campaigns under this AA.
  const { data: campRows } = await sb
    .from("meta_campaigns")
    .select("meta_campaign_id, status, effective_status")
    .eq("user_id", USER_ID)
    .eq("meta_ad_account_id", aaUuid);
  const campaignTextIds = (campRows || []).map((c) => c.meta_campaign_id);

  // 3a. Campaign insights for those campaigns.
  const ciRows =
    campaignTextIds.length === 0
      ? []
      : await fetchAllInChunks(
          sb,
          "meta_campaign_insights",
          {},
          "meta_campaign_id",
          campaignTextIds,
          since,
          until
        );
  const campaign = aggregate(ciRows);

  // 4. Adsets under those campaigns.
  let adsetTextIds = [];
  if (campaignTextIds.length > 0) {
    const { data: adsetRows } = await sb
      .from("meta_adsets")
      .select("meta_adset_id")
      .eq("user_id", USER_ID)
      .in("meta_campaign_id", campaignTextIds);
    adsetTextIds = (adsetRows || []).map((a) => a.meta_adset_id);
  }

  // 4a. Adset insights.
  const adsetInsRows =
    adsetTextIds.length === 0
      ? []
      : await fetchAllInChunks(
          sb,
          "meta_adset_insights",
          {},
          "meta_adset_id",
          adsetTextIds,
          since,
          until
        );
  const adset = aggregate(adsetInsRows);

  // 5. Ads under those adsets.
  let adTextIds = [];
  if (adsetTextIds.length > 0) {
    // Chunk meta_adset_id IN clause too.
    const CHUNK = 200;
    for (let i = 0; i < adsetTextIds.length; i += CHUNK) {
      const slice = adsetTextIds.slice(i, i + CHUNK);
      const { data: adRows } = await sb
        .from("meta_ads")
        .select("meta_ad_id")
        .eq("user_id", USER_ID)
        .in("meta_adset_id", slice);
      for (const r of adRows || []) adTextIds.push(r.meta_ad_id);
    }
  }

  // 5a. Ad insights.
  const adInsRows =
    adTextIds.length === 0
      ? []
      : await fetchAllInChunks(
          sb,
          "meta_ad_insights",
          {},
          "meta_ad_id",
          adTextIds,
          since,
          until
        );
  const ad = aggregate(adInsRows);

  printAaBlock({
    preset,
    since,
    until,
    aaTextId,
    aaName,
    campaignCount: campaignTextIds.length,
    adsetCount: adsetTextIds.length,
    adCount: adTextIds.length,
    levels: { account, campaign, adset, ad },
  });
}

function fmtRange(min, max) {
  if (!min || !max) return "—".padEnd(22);
  if (min === max) return min.padEnd(22);
  return `${min}..${max}`.padEnd(22);
}

function fmt(n, w) {
  return String(n).padStart(w);
}

function fmt2(n, w) {
  return n.toFixed(2).padStart(w);
}

function printAaBlock({
  preset,
  since,
  until,
  aaTextId,
  aaName,
  campaignCount,
  adsetCount,
  adCount,
  levels,
}) {
  console.log(`\nAA ${aaTextId} (${aaName ?? ""})`);
  console.log(
    `  entities: campaigns=${campaignCount}  adsets=${adsetCount}  ads=${adCount}`
  );
  console.log(
    `  level             rows   date range              spend       impr  clicks  purch`
  );
  console.log(
    `  ---------------   ----   ----------              -----       ----  ------  -----`
  );
  for (const key of ["account", "campaign", "adset", "ad"]) {
    const L = levels[key];
    console.log(
      `  ${key.padEnd(15)} ${fmt(L.rows, 5)}   ${fmtRange(L.minDate, L.maxDate)}  ${fmt2(L.spend, 8)}  ${fmt(L.impressions, 8)}  ${fmt(L.clicks, 5)}  ${fmt(L.purchases, 5)}`
    );
  }
  // Parity vs account level.
  const acc = levels.account;
  const drift = ["campaign", "adset", "ad"].map((k) => {
    const L = levels[k];
    return {
      k,
      spend: L.spend - acc.spend,
      imp: L.impressions - acc.impressions,
      clicks: L.clicks - acc.clicks,
      purch: L.purchases - acc.purchases,
    };
  });
  const anyDrift = drift.some(
    (d) => d.spend !== 0 || d.imp !== 0 || d.clicks !== 0 || d.purch !== 0
  );
  if (anyDrift) {
    console.log(`  ↳ drift vs account-level:`);
    for (const d of drift) {
      console.log(
        `      ${d.k.padEnd(10)} Δspend=${d.spend.toFixed(2).padStart(8)}  Δimp=${String(d.imp).padStart(6)}  Δclicks=${String(d.clicks).padStart(5)}  Δpurch=${String(d.purch).padStart(4)}`
      );
    }
  } else {
    console.log(`  ↳ all 4 levels match exactly`);
  }
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  for (const preset of PRESETS_TO_RUN) {
    const { since, until } = presetToRange(preset);
    console.log(
      `\n================================================================`
    );
    console.log(
      `Preset: ${preset.padEnd(14)} Window: ${since} .. ${until}`
    );
    console.log(
      `================================================================`
    );
    for (const aa of AAS_TO_RUN) {
      await reconcileOne(sb, aa, preset);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
