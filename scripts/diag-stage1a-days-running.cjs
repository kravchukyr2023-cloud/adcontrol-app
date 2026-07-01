/* eslint-disable */
// Stage 6.5/1a verification: prove that the new EntityPerformance fields
// (startDate, daysRunning, creativeName) actually get populated from data
// already in the DB — no new Meta fetches involved.
//
// Run:
//   node scripts/diag-stage1a-days-running.cjs <project_id>
//
// Read-only. Replicates the SELECT + day math from
// src/server/decisions/monthly-snapshot.ts:deriveRuntime — if this script
// prints non-null values, the snapshot builder will too.

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

function deriveRuntime(raw) {
  if (!raw) return { startDate: null, daysRunning: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { startDate: null, daysRunning: null };
  }
  const startUtcMidnight = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  );
  const now = new Date();
  const todayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const daysRunning = Math.max(
    0,
    Math.floor((todayUtcMidnight - startUtcMidnight) / dayMs)
  );
  const startDate = new Date(startUtcMidnight).toISOString().slice(0, 10);
  return { startDate, daysRunning };
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: node scripts/diag-stage1a-days-running.cjs <project_id>");
    process.exit(1);
  }

  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ADMIN_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // 1. Resolve active AA uuids for the project (same chain the builder uses).
  const { data: bindings, error: bErr } = await admin
    .from("project_meta_ad_accounts")
    .select(
      "meta_ad_account_id, project_meta_business_managers ( status, meta_connections ( status ) )"
    )
    .eq("project_id", projectId)
    .eq("status", "active");
  if (bErr) throw bErr;

  const aaUuids = [];
  for (const b of bindings || []) {
    const bm = b.project_meta_business_managers;
    const conn = bm && bm.meta_connections;
    if (!bm || bm.status !== "active") continue;
    if (!conn || conn.status !== "active") continue;
    if (b.meta_ad_account_id) aaUuids.push(b.meta_ad_account_id);
  }
  console.log(`\nProject ${projectId}`);
  console.log(`Active ad-account UUIDs: ${aaUuids.length}`);
  if (aaUuids.length === 0) {
    console.log("No active AAs — nothing to inspect.");
    return;
  }

  // 2. Pull the same columns the snapshot builder now reads.
  const { data: campaigns, error: cErr } = await admin
    .from("meta_campaigns")
    .select("id, campaign_name, created_time")
    .in("meta_ad_account_id", aaUuids)
    .order("created_time", { ascending: false, nullsFirst: false })
    .limit(5);
  if (cErr) throw cErr;

  console.log("\n=== Campaigns (up to 5) ===");
  if (!campaigns || campaigns.length === 0) {
    console.log("(no campaigns)");
  } else {
    for (const c of campaigns) {
      const { startDate, daysRunning } = deriveRuntime(c.created_time);
      console.log(
        `- ${c.campaign_name || "(unnamed)"}`,
        `\n    raw created_time: ${c.created_time}`,
        `\n    startDate:        ${startDate}`,
        `\n    daysRunning:      ${daysRunning}`
      );
    }
  }

  // One adset to prove start_time ?? created_time works.
  const campaignIds = (campaigns || []).map((c) => c.id);
  if (campaignIds.length > 0) {
    const { data: adsets } = await admin
      .from("meta_adsets")
      .select("id, adset_name, start_time, created_time")
      .in("meta_campaign_id_fk", campaignIds)
      .limit(3);
    console.log("\n=== Adsets (up to 3) ===");
    for (const a of adsets || []) {
      const raw = a.start_time || a.created_time;
      const { startDate, daysRunning } = deriveRuntime(raw);
      console.log(
        `- ${a.adset_name || "(unnamed)"}`,
        `\n    start_time:   ${a.start_time}`,
        `\n    created_time: ${a.created_time}`,
        `\n    startDate:    ${startDate}`,
        `\n    daysRunning:  ${daysRunning}`
      );
    }
  }

  // One ad to prove creative_name is present.
  const { data: adsetsForAds } = await admin
    .from("meta_adsets")
    .select("id")
    .in("meta_campaign_id_fk", campaignIds);
  const adsetIds = (adsetsForAds || []).map((a) => a.id);
  if (adsetIds.length > 0) {
    const { data: ads } = await admin
      .from("meta_ads")
      .select("ad_name, creative_name, created_time")
      .in("meta_adset_id_fk", adsetIds)
      .not("creative_name", "is", null)
      .limit(1);
    console.log("\n=== Ad with creative_name (1) ===");
    if (!ads || ads.length === 0) {
      // Fallback: any ad, even without creative_name, so we still see created_time.
      const { data: anyAd } = await admin
        .from("meta_ads")
        .select("ad_name, creative_name, created_time")
        .in("meta_adset_id_fk", adsetIds)
        .limit(1);
      for (const a of anyAd || []) {
        const { startDate, daysRunning } = deriveRuntime(a.created_time);
        console.log(
          `- ${a.ad_name || "(unnamed)"}`,
          `\n    creative_name: ${a.creative_name}`,
          `\n    startDate:     ${startDate}`,
          `\n    daysRunning:   ${daysRunning}`
        );
      }
      if (!anyAd || anyAd.length === 0) console.log("(no ads at all)");
    } else {
      for (const a of ads) {
        const { startDate, daysRunning } = deriveRuntime(a.created_time);
        console.log(
          `- ${a.ad_name || "(unnamed)"}`,
          `\n    creative_name: ${a.creative_name}`,
          `\n    startDate:     ${startDate}`,
          `\n    daysRunning:   ${daysRunning}`
        );
      }
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
