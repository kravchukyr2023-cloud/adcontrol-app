/* eslint-disable */
// One-off DB count verifier. Run: node scripts/check-counts.cjs
// Loads .env.local manually (no dotenv dep).

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

const TABLES = [
  "meta_campaigns",
  "meta_adsets",
  "meta_ads",
  "meta_ad_account_insights",
  "meta_campaign_insights",
  "meta_adset_insights",
  "meta_ad_insights",
];

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env vars");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(`# Row counts for user_id=${USER_ID}\n`);
  for (const table of TABLES) {
    const { count, error } = await sb
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", USER_ID);
    if (error) {
      console.log(`${table.padEnd(30)} ERROR ${error.message}`);
    } else {
      console.log(`${table.padEnd(30)} ${count ?? 0}`);
    }
  }

  console.log(`\n# Sync state rows`);
  const { data: states, error: stErr } = await sb
    .from("meta_sync_states")
    .select(
      "resource_type, resource_id, sync_status, sync_version, last_sync_at, last_successful_sync_at, last_manual_sync_at, last_error, heartbeat_at"
    )
    .eq("user_id", USER_ID)
    .order("resource_type", { ascending: true })
    .order("resource_id", { ascending: true });
  if (stErr) {
    console.log(`sync_states ERROR ${stErr.message}`);
  } else {
    for (const s of states ?? []) {
      console.log(
        `${s.resource_type.padEnd(20)} ${String(s.resource_id).padEnd(28)} ${s.sync_status.padEnd(8)} v=${s.sync_version} last_sync=${s.last_sync_at ?? "—"} last_success=${s.last_successful_sync_at ?? "—"} last_err=${s.last_error ?? "—"}`
      );
    }
  }

  console.log(`\n# Latest insight last_synced_at per insight table`);
  const INSIGHT_TABLES = [
    "meta_ad_account_insights",
    "meta_campaign_insights",
    "meta_adset_insights",
    "meta_ad_insights",
  ];
  for (const t of INSIGHT_TABLES) {
    const { data: r, error: e } = await sb
      .from(t)
      .select("last_synced_at, date")
      .eq("user_id", USER_ID)
      .order("last_synced_at", { ascending: false })
      .limit(1);
    if (e) {
      console.log(`${t.padEnd(30)} ERROR ${e.message}`);
    } else if (!r || r.length === 0) {
      console.log(`${t.padEnd(30)} (no rows)`);
    } else {
      console.log(
        `${t.padEnd(30)} most_recent_last_synced_at=${r[0].last_synced_at} max_date=${r[0].date}`
      );
    }
  }

  console.log(`\n# Account insights per AA (counts + date range)`);
  const { data: aaInsights } = await sb
    .from("meta_ad_account_insights")
    .select("meta_ad_account_id, date, last_synced_at")
    .eq("user_id", USER_ID);
  const perAa = new Map();
  for (const r of aaInsights ?? []) {
    const a = perAa.get(r.meta_ad_account_id) ?? {
      count: 0,
      minDate: r.date,
      maxDate: r.date,
      latestSync: r.last_synced_at,
    };
    a.count++;
    if (r.date < a.minDate) a.minDate = r.date;
    if (r.date > a.maxDate) a.maxDate = r.date;
    if (r.last_synced_at > a.latestSync) a.latestSync = r.last_synced_at;
    perAa.set(r.meta_ad_account_id, a);
  }
  for (const [aa, s] of perAa.entries()) {
    console.log(
      `${aa.padEnd(22)} rows=${s.count.toString().padStart(3)} dates=${s.minDate}..${s.maxDate} latest_sync=${s.latestSync}`
    );
  }

  console.log(`\n# Ad accounts (active)`);
  const { data: aas } = await sb
    .from("meta_ad_accounts")
    .select("id, meta_ad_account_id, ad_account_name, currency, status, meta_account_status_code")
    .eq("user_id", USER_ID);
  for (const a of aas ?? []) {
    console.log(
      `${a.meta_ad_account_id.padEnd(20)} status=${a.status} code=${a.meta_account_status_code ?? "—"} currency=${a.currency ?? "—"} name="${a.ad_account_name ?? ""}"`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
