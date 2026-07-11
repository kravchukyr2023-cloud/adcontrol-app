/* eslint-disable */
// Sprint 7 stage 7.5b — seed the "Aurora Cosmetics" demo project.
//
// Idempotent. Re-running upserts everything without duplicating anything.
// The demo user's projectId stays stable across runs.
//
// Prereqs in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL  (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
//   DEMO_USER_EMAIL           (never hardcoded)
//   DEMO_USER_PASSWORD        (never hardcoded)
//
// Usage:
//   node scripts/seed-demo-project.cjs
//   node scripts/seed-demo-project.cjs --verify        # skip seed, only verify
//
// What it does:
//   1. Ensures a demo auth user + public.users row with is_demo=true.
//   2. Ensures a project "Aurora Cosmetics" for that user with the exact
//      target ROAS / revenue goal / ad budget the rules engine needs.
//   3. Wires a fake Meta connection → BM → AA and links it to the project
//      via project_meta_business_managers + project_meta_ad_accounts,
//      both with status='active' (required — the snapshot builder and
//      the decisions cron both filter on status='active').
//   4. Upserts 5 campaigns / 10 adsets / 20 ads (Lookalike is 3+3, the
//      rest are 2+2×2) with stable meta_*_id text ids.
//   5. Deletes then re-inserts per-day insights for
//         meta_campaign_insights, meta_adset_insights, meta_ad_insights,
//         meta_ad_account_insights
//      from the 1st of this UTC month through yesterday.
//      AA-level insights are the arithmetic sum of the campaign rows for
//      the same day — the snapshot builder reads totals from AA-level,
//      not from campaign-level.
//   6. Deletes then re-inserts orders for the same range with
//      matched_meta_* already resolved (skips the async matcher).
//   7. Runs the same rule logic buildMonthlySnapshot + evaluate would run
//      and prints which ruleIds fired with severity + confidence.
//
// The seeder pins numeric distributions with `largestRemainder` so per-day
// slices sum EXACTLY to the campaign totals — no float drift, so re-runs
// on different days of the month produce the same monthly aggregates.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ---------- constants (pinned to rules.ts TUNING) ----------
const PROJECT_NAME = "Aurora Cosmetics";
const CURRENCY = "USD";
const TARGET_ROAS = 3.0;
const MONTHLY_REVENUE_GOAL = 250000;
const MONTHLY_AD_BUDGET = 120000;

const RULE_TUNING = {
  attributionWarningCoverage: 0.3,
  attributionReliableCoverage: 0.5,
  revenueUndershootWarning: 0.8,
  revenueUndershootCritical: 0.5,
  roasCriticalMultiplier: 0.5,
  campaignSpendSignificance: 0.1,
  campaignSpendCriticalShare: 0.2,
  metaOverstateRoasFloor: 0.3,
  metaOverstateSpendShare: 0.05,
  adsetSpendShare: 0.05,
  adsetWeakRatio: 0.5,
  adOpportunityRoasMultiplier: 1.5,
};

// Fabricated text ids for Meta entities. Stable → upserts land on same rows.
const META_USER_ID_TEXT = "9996000000000001";
const META_BM_ID_TEXT = "9997000000000001";
const META_AA_ID_TEXT = "act_9998000000000001";

// Static tree describing the full project — all totals in USD, purchases
// as integers, orders as integers. Every leaf sums exactly to its parent.
const TREE = [
  {
    key: "broad",
    metaId: "9990000000000001",
    name: "Broad Prospecting — US",
    totals: { spend: 26000, metaRevenue: 22000, purchases: 10, orders: 0, realRevenue: 0 },
    adsets: [
      {
        key: "broad_a1",
        metaId: "9991000000000001",
        name: "Broad Prospecting — Interests Mix",
        totals: { spend: 13000, metaRevenue: 11000, purchases: 5, orders: 0, realRevenue: 0 },
        ads: [
          { key: "broad_a1_ad1", metaId: "9992000000000001", name: "Broad — Product Feed",
            totals: { spend: 6500, metaRevenue: 5500, purchases: 3, orders: 0, realRevenue: 0 } },
          { key: "broad_a1_ad2", metaId: "9992000000000002", name: "Broad — Lifestyle Reel",
            totals: { spend: 6500, metaRevenue: 5500, purchases: 2, orders: 0, realRevenue: 0 } },
        ],
      },
      {
        key: "broad_a2",
        metaId: "9991000000000002",
        name: "Broad Prospecting — Advantage+",
        totals: { spend: 13000, metaRevenue: 11000, purchases: 5, orders: 0, realRevenue: 0 },
        ads: [
          { key: "broad_a2_ad1", metaId: "9992000000000003", name: "Broad — Cleanser 15s",
            totals: { spend: 6500, metaRevenue: 5500, purchases: 3, orders: 0, realRevenue: 0 } },
          { key: "broad_a2_ad2", metaId: "9992000000000004", name: "Broad — Serum 15s",
            totals: { spend: 6500, metaRevenue: 5500, purchases: 2, orders: 0, realRevenue: 0 } },
        ],
      },
    ],
  },
  {
    key: "retargeting",
    metaId: "9990000000000002",
    name: "Retargeting 30d",
    totals: { spend: 18000, metaRevenue: 62000, purchases: 90, orders: 8, realRevenue: 12000 },
    adsets: [
      {
        key: "retargeting_a1",
        metaId: "9991000000000003",
        name: "Retargeting — Cart Abandoners",
        totals: { spend: 9000, metaRevenue: 31000, purchases: 45, orders: 4, realRevenue: 6000 },
        ads: [
          { key: "retargeting_a1_ad1", metaId: "9992000000000005", name: "Cart — Free Shipping 15s",
            totals: { spend: 4500, metaRevenue: 15500, purchases: 23, orders: 2, realRevenue: 3000 } },
          { key: "retargeting_a1_ad2", metaId: "9992000000000006", name: "Cart — 10% off Static",
            totals: { spend: 4500, metaRevenue: 15500, purchases: 22, orders: 2, realRevenue: 3000 } },
        ],
      },
      {
        key: "retargeting_a2",
        metaId: "9991000000000004",
        name: "Retargeting — Site Viewers 14d",
        totals: { spend: 9000, metaRevenue: 31000, purchases: 45, orders: 4, realRevenue: 6000 },
        ads: [
          { key: "retargeting_a2_ad1", metaId: "9992000000000007", name: "Viewers — Bestseller Carousel",
            totals: { spend: 4500, metaRevenue: 15500, purchases: 23, orders: 2, realRevenue: 3000 } },
          { key: "retargeting_a2_ad2", metaId: "9992000000000008", name: "Viewers — Founder UGC",
            totals: { spend: 4500, metaRevenue: 15500, purchases: 22, orders: 2, realRevenue: 3000 } },
        ],
      },
    ],
  },
  {
    key: "lookalike",
    metaId: "9990000000000003",
    name: "Lookalike 1% — Skincare",
    totals: { spend: 40000, metaRevenue: 121000, purchases: 96, orders: 100, realRevenue: 118000 },
    adsets: [
      {
        key: "lal_a1",
        metaId: "9991000000000005",
        name: "Skincare Enthusiasts 25–44",
        totals: { spend: 16000, metaRevenue: 48000, purchases: 40, orders: 52, realRevenue: 62000 },
        ads: [
          { key: "lal_a1_ad1", metaId: "9992000000000009", name: "Serum Before-After 15s",
            totals: { spend: 6000, metaRevenue: 18000, purchases: 15, orders: 25, realRevenue: 30000 } },
          { key: "lal_a1_ad2", metaId: "9992000000000010", name: "Founder Story 30s",
            totals: { spend: 6000, metaRevenue: 18000, purchases: 15, orders: 17, realRevenue: 20000 } },
          { key: "lal_a1_ad3", metaId: "9992000000000011", name: "Product Carousel",
            totals: { spend: 4000, metaRevenue: 12000, purchases: 10, orders: 10, realRevenue: 12000 } },
        ],
      },
      {
        key: "lal_a2",
        metaId: "9991000000000006",
        name: "Anti-Aging Lookalike",
        totals: { spend: 14000, metaRevenue: 45000, purchases: 35, orders: 40, realRevenue: 48000 },
        ads: [
          { key: "lal_a2_ad1", metaId: "9992000000000012", name: "Retinol — Ingredient Story",
            totals: { spend: 7000, metaRevenue: 23000, purchases: 18, orders: 21, realRevenue: 25000 } },
          { key: "lal_a2_ad2", metaId: "9992000000000013", name: "Retinol — Testimonial",
            totals: { spend: 7000, metaRevenue: 22000, purchases: 17, orders: 19, realRevenue: 23000 } },
        ],
      },
      {
        key: "lal_a3",
        metaId: "9991000000000007",
        name: "Broad Skincare LAL 5%",
        totals: { spend: 10000, metaRevenue: 28000, purchases: 21, orders: 8, realRevenue: 8000 },
        ads: [
          { key: "lal_a3_ad1", metaId: "9992000000000014", name: "LAL5 — Cleanser Static",
            totals: { spend: 5000, metaRevenue: 14000, purchases: 11, orders: 5, realRevenue: 5000 } },
          { key: "lal_a3_ad2", metaId: "9992000000000015", name: "LAL5 — Toner Reel",
            totals: { spend: 5000, metaRevenue: 14000, purchases: 10, orders: 3, realRevenue: 3000 } },
        ],
      },
    ],
  },
  {
    key: "interest",
    metaId: "9990000000000004",
    name: "Interest — Clean Beauty",
    totals: { spend: 22000, metaRevenue: 54000, purchases: 48, orders: 30, realRevenue: 26000 },
    adsets: [
      {
        key: "int_a1",
        metaId: "9991000000000008",
        name: "Clean Beauty — Vegan Cosmetics",
        totals: { spend: 11000, metaRevenue: 27000, purchases: 24, orders: 15, realRevenue: 13000 },
        ads: [
          { key: "int_a1_ad1", metaId: "9992000000000016", name: "Vegan — Ingredient Deck",
            totals: { spend: 5500, metaRevenue: 13500, purchases: 12, orders: 8, realRevenue: 6500 } },
          { key: "int_a1_ad2", metaId: "9992000000000017", name: "Vegan — Founder Voice-over",
            totals: { spend: 5500, metaRevenue: 13500, purchases: 12, orders: 7, realRevenue: 6500 } },
        ],
      },
      {
        key: "int_a2",
        metaId: "9991000000000009",
        name: "Clean Beauty — Sustainable Packaging",
        totals: { spend: 11000, metaRevenue: 27000, purchases: 24, orders: 15, realRevenue: 13000 },
        ads: [
          { key: "int_a2_ad1", metaId: "9992000000000018", name: "Packaging — Refill Story",
            totals: { spend: 5500, metaRevenue: 13500, purchases: 12, orders: 8, realRevenue: 6500 } },
          { key: "int_a2_ad2", metaId: "9992000000000019", name: "Packaging — Comparison Chart",
            totals: { spend: 5500, metaRevenue: 13500, purchases: 12, orders: 7, realRevenue: 6500 } },
        ],
      },
    ],
  },
  {
    key: "video",
    metaId: "9990000000000005",
    name: "Video Views — Awareness",
    totals: { spend: 14000, metaRevenue: 9000, purchases: 14, orders: 6, realRevenue: 8000 },
    adsets: [
      {
        key: "vid_a1",
        metaId: "9991000000000010",
        name: "Awareness — Brand Story 30s",
        totals: { spend: 7000, metaRevenue: 4500, purchases: 7, orders: 3, realRevenue: 4000 },
        ads: [
          { key: "vid_a1_ad1", metaId: "9992000000000020", name: "Brand Story — Long Reel",
            totals: { spend: 3500, metaRevenue: 2250, purchases: 4, orders: 2, realRevenue: 2000 } },
          { key: "vid_a1_ad2", metaId: "9992000000000021", name: "Brand Story — Short Cut 15s",
            totals: { spend: 3500, metaRevenue: 2250, purchases: 3, orders: 1, realRevenue: 2000 } },
        ],
      },
      {
        key: "vid_a2",
        metaId: "9991000000000011",
        name: "Awareness — Founder Interview",
        totals: { spend: 7000, metaRevenue: 4500, purchases: 7, orders: 3, realRevenue: 4000 },
        ads: [
          { key: "vid_a2_ad1", metaId: "9992000000000022", name: "Interview — Product Origin",
            totals: { spend: 3500, metaRevenue: 2250, purchases: 4, orders: 2, realRevenue: 2000 } },
          { key: "vid_a2_ad2", metaId: "9992000000000023", name: "Interview — Behind the Scenes",
            totals: { spend: 3500, metaRevenue: 2250, purchases: 3, orders: 1, realRevenue: 2000 } },
        ],
      },
    ],
  },
];

// ---------- env ----------
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const demoEmail = process.env.DEMO_USER_EMAIL;
  const demoPassword = process.env.DEMO_USER_PASSWORD;
  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!demoEmail) missing.push("DEMO_USER_EMAIL");
  if (!demoPassword) missing.push("DEMO_USER_PASSWORD");
  if (missing.length > 0) {
    console.error("Missing env vars: " + missing.join(", "));
    process.exit(1);
  }
  return { url, key, demoEmail, demoPassword };
}

// ---------- date helpers ----------
function thisMonthRangeUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = now.getUTCDate();
  const since = new Date(Date.UTC(y, m, 1));
  // "1st of month through YESTERDAY" — a real cron only lands data for
  // completed days. If today is the 1st, this yields an empty range and
  // the seeder logs a warning (nothing to seed for M-of-current month).
  const untilDay = today - 1;
  const until = untilDay >= 1 ? new Date(Date.UTC(y, m, untilDay)) : null;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    since,
    until,
    daysCovered: untilDay,
    dayOfMonth: today,
    daysInMonth,
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysList(since, daysCovered) {
  const out = [];
  for (let i = 0; i < daysCovered; i++) {
    const d = new Date(since.getTime());
    d.setUTCDate(since.getUTCDate() + i);
    out.push(isoDate(d));
  }
  return out;
}

// ---------- deterministic largest-remainder ----------
// Split `total` (integer or decimal) into `n` buckets that sum EXACTLY to
// `total`, distributed evenly plus a small deterministic wiggle. The
// wiggle amplitude is capped so no bucket ever goes negative.
function splitNumeric(total, n, seed, cents = 2) {
  if (n <= 0) return [];
  const scale = Math.pow(10, cents);
  const scaled = Math.round(total * scale);
  const base = Math.floor(scaled / n);
  const remainder = scaled - base * n;
  // Deterministic pseudo-shuffled bump order.
  const bumpOrder = seededOrder(n, seed);
  const buckets = new Array(n).fill(base);
  for (let i = 0; i < remainder; i++) {
    buckets[bumpOrder[i % n]] += 1;
  }
  return buckets.map((s) => s / scale);
}

function splitInteger(total, n, seed) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const bumpOrder = seededOrder(n, seed);
  const buckets = new Array(n).fill(base);
  for (let i = 0; i < remainder; i++) {
    buckets[bumpOrder[i % n]] += 1;
  }
  return buckets;
}

function seededOrder(n, seed) {
  const rng = mulberry32(hashSeed(seed));
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  return idx;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- supabase helpers ----------
async function findRow(supa, table, filters, columns = "id") {
  let q = supa.from(table).select(columns);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q.maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(`${table} lookup: ${error.message}`);
  return data ?? null;
}

async function insertReturning(supa, table, row, returning = "id") {
  const { data, error } = await supa.from(table).insert(row).select(returning).single();
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return data;
}

async function updateWhere(supa, table, filters, patch) {
  let q = supa.from(table).update(patch);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw new Error(`${table} update: ${error.message}`);
}

// ---------- steps ----------
async function ensureDemoUser(supa, email, password) {
  // 1. Find or create in auth.users.
  let authUser = null;
  let page = 1;
  const perPage = 200;
  while (!authUser) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.listUsers: ${error.message}`);
    authUser = data.users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (authUser) break;
    if (data.users.length < perPage) break;
    page += 1;
  }
  if (!authUser) {
    const { data, error } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`auth.createUser: ${error.message}`);
    authUser = data.user;
    console.log(`  created auth user ${authUser.id}`);
  } else {
    // Reset password to what's in env so re-runs stay in sync.
    const { error } = await supa.auth.admin.updateUserById(authUser.id, { password });
    if (error) throw new Error(`auth.updateUserById: ${error.message}`);
    console.log(`  reused auth user ${authUser.id} (password reset)`);
  }

  // 2. public.users row + is_demo=true.
  const { error } = await supa
    .from("users")
    .upsert(
      { id: authUser.id, email, is_demo: true, full_name: "Demo (Aurora Cosmetics)" },
      { onConflict: "id" }
    );
  if (error) throw new Error(`public.users upsert: ${error.message}`);

  return authUser.id;
}

async function ensureProject(supa, userId) {
  const patch = {
    user_id: userId,
    name: PROJECT_NAME,
    description: "Demo workspace — read-only. Data is synthetic.",
    currency: CURRENCY,
    timezone: "UTC",
    monthly_revenue_goal: MONTHLY_REVENUE_GOAL,
    monthly_ad_budget: MONTHLY_AD_BUDGET,
    target_roas: TARGET_ROAS,
    target_cpa: 50,
  };
  const existing = await findRow(supa, "projects", { user_id: userId, name: PROJECT_NAME });
  if (existing) {
    await updateWhere(supa, "projects", { id: existing.id }, patch);
    return existing.id;
  }
  const row = await insertReturning(supa, "projects", patch);
  return row.id;
}

async function ensureMetaConnection(supa, userId) {
  const existing = await findRow(supa, "meta_connections", {
    user_id: userId,
    meta_user_id: META_USER_ID_TEXT,
  });
  const patch = {
    user_id: userId,
    meta_user_id: META_USER_ID_TEXT,
    meta_user_name: "Demo Meta Account",
    scope: "ads_read,business_management",
    connection_status: "connected",
    status: "active",
    last_connected_at: new Date().toISOString(),
  };
  if (existing) {
    await updateWhere(supa, "meta_connections", { id: existing.id }, patch);
    return existing.id;
  }
  const row = await insertReturning(supa, "meta_connections", patch);
  return row.id;
}

async function ensureMetaBusinessManager(supa, userId, connectionId) {
  const existing = await findRow(supa, "meta_business_managers", {
    user_id: userId,
    meta_bm_id: META_BM_ID_TEXT,
  });
  const patch = {
    user_id: userId,
    connection_id: connectionId,
    meta_bm_id: META_BM_ID_TEXT,
    bm_name: "Aurora Cosmetics BM",
    status: "active",
  };
  if (existing) {
    await updateWhere(supa, "meta_business_managers", { id: existing.id }, patch);
    return existing.id;
  }
  const row = await insertReturning(supa, "meta_business_managers", patch);
  return row.id;
}

async function ensureMetaAdAccount(supa, userId, bmId) {
  const existing = await findRow(supa, "meta_ad_accounts", {
    user_id: userId,
    meta_ad_account_id: META_AA_ID_TEXT,
  });
  const patch = {
    user_id: userId,
    meta_business_manager_id: bmId,
    meta_ad_account_id: META_AA_ID_TEXT,
    ad_account_name: "Aurora Cosmetics — Main AA",
    account_status: "ACTIVE",
    meta_account_status_code: 1,
    currency: CURRENCY,
    status: "active",
  };
  if (existing) {
    await updateWhere(supa, "meta_ad_accounts", { id: existing.id }, patch);
    return existing.id;
  }
  const row = await insertReturning(supa, "meta_ad_accounts", patch);
  return row.id;
}

async function ensureProjectBmMembership(supa, userId, projectId, connectionId, bmId) {
  const existing = await findRow(supa, "project_meta_business_managers", {
    user_id: userId,
    project_id: projectId,
    meta_business_manager_id: bmId,
  });
  const patch = {
    user_id: userId,
    project_id: projectId,
    meta_connection_id: connectionId,
    meta_business_manager_id: bmId,
    status: "active",
    removed_at: null,
  };
  if (existing) {
    await updateWhere(supa, "project_meta_business_managers", { id: existing.id }, patch);
    return existing.id;
  }
  const row = await insertReturning(supa, "project_meta_business_managers", patch);
  return row.id;
}

async function ensureProjectAaSelection(supa, userId, projectId, pmbmId, aaId) {
  const existing = await findRow(supa, "project_meta_ad_accounts", {
    user_id: userId,
    project_id: projectId,
    meta_ad_account_id: aaId,
  });
  const patch = {
    user_id: userId,
    project_id: projectId,
    project_meta_business_manager_id: pmbmId,
    meta_ad_account_id: aaId,
    status: "active",
    deselected_at: null,
  };
  if (existing) {
    await updateWhere(supa, "project_meta_ad_accounts", { id: existing.id }, patch);
    return existing.id;
  }
  const row = await insertReturning(supa, "project_meta_ad_accounts", patch);
  return row.id;
}

async function upsertCampaigns(supa, userId, aaId) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const createdTime = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 15)).toISOString();
  const idMap = new Map();
  for (const c of TREE) {
    const patch = {
      user_id: userId,
      meta_ad_account_id: aaId,
      meta_campaign_id: c.metaId,
      campaign_name: c.name,
      objective: "OUTCOME_SALES",
      campaign_status: "ACTIVE",
      effective_status: "ACTIVE",
      buying_type: "AUCTION",
      special_ad_categories: [],
      created_time: createdTime,
      updated_time: new Date().toISOString(),
      status: "active",
      last_synced_at: new Date().toISOString(),
    };
    const { data, error } = await supa
      .from("meta_campaigns")
      .upsert(patch, { onConflict: "user_id,meta_campaign_id" })
      .select("id")
      .single();
    if (error) throw new Error(`meta_campaigns upsert: ${error.message}`);
    idMap.set(c.key, data.id);
  }
  return idMap;
}

async function upsertAdsets(supa, userId, campaignIdByKey) {
  const idMap = new Map();
  const createdTime = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 20)).toISOString();
  for (const c of TREE) {
    const campaignUuid = campaignIdByKey.get(c.key);
    for (const a of c.adsets) {
      const patch = {
        user_id: userId,
        meta_campaign_id_fk: campaignUuid,
        meta_adset_id: a.metaId,
        meta_campaign_id: c.metaId,
        adset_name: a.name,
        adset_status: "ACTIVE",
        effective_status: "ACTIVE",
        optimization_goal: "OFFSITE_CONVERSIONS",
        billing_event: "IMPRESSIONS",
        targeting: { age_min: 25, age_max: 44 },
        start_time: createdTime,
        created_time: createdTime,
        updated_time: new Date().toISOString(),
        status: "active",
        last_synced_at: new Date().toISOString(),
      };
      const { data, error } = await supa
        .from("meta_adsets")
        .upsert(patch, { onConflict: "user_id,meta_adset_id" })
        .select("id")
        .single();
      if (error) throw new Error(`meta_adsets upsert: ${error.message}`);
      idMap.set(a.key, data.id);
    }
  }
  return idMap;
}

async function upsertAds(supa, userId, adsetIdByKey) {
  const idMap = new Map();
  const createdTime = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 25)).toISOString();
  for (const c of TREE) {
    for (const a of c.adsets) {
      const adsetUuid = adsetIdByKey.get(a.key);
      for (const ad of a.ads) {
        const patch = {
          user_id: userId,
          meta_adset_id_fk: adsetUuid,
          meta_ad_id: ad.metaId,
          meta_adset_id: a.metaId,
          meta_campaign_id: c.metaId,
          ad_name: ad.name,
          ad_status: "ACTIVE",
          effective_status: "ACTIVE",
          creative_id: `cr_${ad.metaId}`,
          creative_name: ad.name,
          created_time: createdTime,
          updated_time: new Date().toISOString(),
          status: "active",
          last_synced_at: new Date().toISOString(),
        };
        const { data, error } = await supa
          .from("meta_ads")
          .upsert(patch, { onConflict: "user_id,meta_ad_id" })
          .select("id")
          .single();
        if (error) throw new Error(`meta_ads upsert: ${error.message}`);
        idMap.set(ad.key, data.id);
      }
    }
  }
  return idMap;
}

async function wipeMonthlyInsightsAndOrders(supa, userId, projectId, aaId, campaignIds, adsetIds, adIds, since, until) {
  const sinceIso = isoDate(since);
  const untilIso = isoDate(until);
  const tables = [
    { table: "meta_ad_account_insights", ids: [aaId], col: "meta_ad_account_id_fk" },
    { table: "meta_campaign_insights", ids: [...campaignIds.values()], col: "meta_campaign_id_fk" },
    { table: "meta_adset_insights", ids: [...adsetIds.values()], col: "meta_adset_id_fk" },
    { table: "meta_ad_insights", ids: [...adIds.values()], col: "meta_ad_id_fk" },
  ];
  for (const t of tables) {
    if (t.ids.length === 0) continue;
    const { error } = await supa
      .from(t.table)
      .delete()
      .eq("user_id", userId)
      .in(t.col, t.ids)
      .gte("date", sinceIso)
      .lte("date", untilIso);
    if (error) throw new Error(`${t.table} wipe: ${error.message}`);
  }
  const { error: ordersErr } = await supa
    .from("orders")
    .delete()
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .gte("order_date", sinceIso)
    .lte("order_date", untilIso);
  if (ordersErr) throw new Error(`orders wipe: ${ordersErr.message}`);
}

async function insertInsights(supa, userId, aaUuid, campaignIds, adsetIds, adIds, dates, scale) {
  const n = dates.length;

  // ---- 1. Build per-entity per-day slices with largestRemainder. ----
  const perAdSlices = new Map(); // adKey -> { spend[], impressions[], clicks[], purchases[], revenue[] }

  const CPM = 10;   // $10 per 1k impressions
  const CTR = 0.015; // 1.5%

  // TZ totals are full-month projections. Scale them to what should have
  // landed in the `daysCovered` window so pro-rated M1 comparisons work.
  for (const c of TREE) {
    for (const a of c.adsets) {
      for (const ad of a.ads) {
        const scaledSpend = ad.totals.spend * scale;
        const scaledRevenue = ad.totals.metaRevenue * scale;
        const scaledPurchases = Math.round(ad.totals.purchases * scale);
        const spend = splitNumeric(scaledSpend, n, `${ad.key}:spend`, 2);
        const revenue = splitNumeric(scaledRevenue, n, `${ad.key}:rev`, 2);
        const purchases = splitInteger(scaledPurchases, n, `${ad.key}:purch`);
        // impressions/clicks derived from spend; CPM implies impressions = spend/CPM*1000.
        // Use integer split from total to keep sums stable.
        const totalImpr = Math.round((scaledSpend / CPM) * 1000);
        const totalClicks = Math.round(totalImpr * CTR);
        const impressions = splitInteger(totalImpr, n, `${ad.key}:impr`);
        const clicks = splitInteger(totalClicks, n, `${ad.key}:clk`);
        perAdSlices.set(ad.key, { spend, revenue, purchases, impressions, clicks });
      }
    }
  }

  // ---- 2. Build per-adset per-day = sum of its ads' slices. ----
  const perAdsetSlices = new Map();
  for (const c of TREE) {
    for (const a of c.adsets) {
      const s = { spend: new Array(n).fill(0), revenue: new Array(n).fill(0), purchases: new Array(n).fill(0), impressions: new Array(n).fill(0), clicks: new Array(n).fill(0) };
      for (const ad of a.ads) {
        const p = perAdSlices.get(ad.key);
        for (let i = 0; i < n; i++) {
          s.spend[i] += p.spend[i];
          s.revenue[i] += p.revenue[i];
          s.purchases[i] += p.purchases[i];
          s.impressions[i] += p.impressions[i];
          s.clicks[i] += p.clicks[i];
        }
      }
      // Round spend/revenue to cents to eliminate float drift.
      for (let i = 0; i < n; i++) {
        s.spend[i] = Math.round(s.spend[i] * 100) / 100;
        s.revenue[i] = Math.round(s.revenue[i] * 100) / 100;
      }
      perAdsetSlices.set(a.key, s);
    }
  }

  // ---- 3. Build per-campaign per-day = sum of its adsets' slices. ----
  const perCampaignSlices = new Map();
  for (const c of TREE) {
    const s = { spend: new Array(n).fill(0), revenue: new Array(n).fill(0), purchases: new Array(n).fill(0), impressions: new Array(n).fill(0), clicks: new Array(n).fill(0) };
    for (const a of c.adsets) {
      const p = perAdsetSlices.get(a.key);
      for (let i = 0; i < n; i++) {
        s.spend[i] += p.spend[i];
        s.revenue[i] += p.revenue[i];
        s.purchases[i] += p.purchases[i];
        s.impressions[i] += p.impressions[i];
        s.clicks[i] += p.clicks[i];
      }
    }
    for (let i = 0; i < n; i++) {
      s.spend[i] = Math.round(s.spend[i] * 100) / 100;
      s.revenue[i] = Math.round(s.revenue[i] * 100) / 100;
    }
    perCampaignSlices.set(c.key, s);
  }

  // ---- 4. Build AA per-day = sum of campaign slices. ----
  const aaSlice = { spend: new Array(n).fill(0), revenue: new Array(n).fill(0), purchases: new Array(n).fill(0), impressions: new Array(n).fill(0), clicks: new Array(n).fill(0) };
  for (const c of TREE) {
    const p = perCampaignSlices.get(c.key);
    for (let i = 0; i < n; i++) {
      aaSlice.spend[i] += p.spend[i];
      aaSlice.revenue[i] += p.revenue[i];
      aaSlice.purchases[i] += p.purchases[i];
      aaSlice.impressions[i] += p.impressions[i];
      aaSlice.clicks[i] += p.clicks[i];
    }
  }
  for (let i = 0; i < n; i++) {
    aaSlice.spend[i] = Math.round(aaSlice.spend[i] * 100) / 100;
    aaSlice.revenue[i] = Math.round(aaSlice.revenue[i] * 100) / 100;
  }

  // ---- 5. Emit rows. ----
  const now = new Date().toISOString();

  const aaRows = dates.map((date, i) => ({
    user_id: userId,
    meta_ad_account_id_fk: aaUuid,
    meta_ad_account_id: META_AA_ID_TEXT,
    date,
    spend: aaSlice.spend[i],
    impressions: aaSlice.impressions[i],
    clicks: aaSlice.clicks[i],
    unique_clicks: Math.round(aaSlice.clicks[i] * 0.9),
    ctr: aaSlice.impressions[i] > 0 ? Math.round((aaSlice.clicks[i] / aaSlice.impressions[i]) * 10000) / 10000 : null,
    cpc: aaSlice.clicks[i] > 0 ? Math.round((aaSlice.spend[i] / aaSlice.clicks[i]) * 10000) / 10000 : null,
    cpm: aaSlice.impressions[i] > 0 ? Math.round((aaSlice.spend[i] / (aaSlice.impressions[i] / 1000)) * 10000) / 10000 : null,
    reach: Math.round(aaSlice.impressions[i] * 0.7),
    frequency: 1.4,
    purchases: aaSlice.purchases[i],
    leads: 0,
    revenue: aaSlice.revenue[i],
    currency: CURRENCY,
    raw_actions: null,
    last_synced_at: now,
  }));

  const campaignRows = [];
  for (const c of TREE) {
    const uuid = campaignIds.get(c.key);
    const slice = perCampaignSlices.get(c.key);
    for (let i = 0; i < n; i++) {
      campaignRows.push({
        user_id: userId,
        meta_campaign_id_fk: uuid,
        meta_campaign_id: c.metaId,
        date: dates[i],
        spend: slice.spend[i],
        impressions: slice.impressions[i],
        clicks: slice.clicks[i],
        unique_clicks: Math.round(slice.clicks[i] * 0.9),
        ctr: slice.impressions[i] > 0 ? Math.round((slice.clicks[i] / slice.impressions[i]) * 10000) / 10000 : null,
        cpc: slice.clicks[i] > 0 ? Math.round((slice.spend[i] / slice.clicks[i]) * 10000) / 10000 : null,
        cpm: slice.impressions[i] > 0 ? Math.round((slice.spend[i] / (slice.impressions[i] / 1000)) * 10000) / 10000 : null,
        reach: Math.round(slice.impressions[i] * 0.7),
        frequency: 1.4,
        purchases: slice.purchases[i],
        leads: 0,
        revenue: slice.revenue[i],
        currency: CURRENCY,
        raw_actions: null,
        last_synced_at: now,
      });
    }
  }

  const adsetRows = [];
  for (const c of TREE) {
    for (const a of c.adsets) {
      const uuid = adsetIds.get(a.key);
      const slice = perAdsetSlices.get(a.key);
      for (let i = 0; i < n; i++) {
        adsetRows.push({
          user_id: userId,
          meta_adset_id_fk: uuid,
          meta_adset_id: a.metaId,
          date: dates[i],
          spend: slice.spend[i],
          impressions: slice.impressions[i],
          clicks: slice.clicks[i],
          unique_clicks: Math.round(slice.clicks[i] * 0.9),
          ctr: slice.impressions[i] > 0 ? Math.round((slice.clicks[i] / slice.impressions[i]) * 10000) / 10000 : null,
          cpc: slice.clicks[i] > 0 ? Math.round((slice.spend[i] / slice.clicks[i]) * 10000) / 10000 : null,
          cpm: slice.impressions[i] > 0 ? Math.round((slice.spend[i] / (slice.impressions[i] / 1000)) * 10000) / 10000 : null,
          reach: Math.round(slice.impressions[i] * 0.7),
          frequency: 1.4,
          purchases: slice.purchases[i],
          leads: 0,
          revenue: slice.revenue[i],
          currency: CURRENCY,
          raw_actions: null,
          last_synced_at: now,
        });
      }
    }
  }

  const adRows = [];
  for (const c of TREE) {
    for (const a of c.adsets) {
      for (const ad of a.ads) {
        const uuid = adIds.get(ad.key);
        const slice = perAdSlices.get(ad.key);
        for (let i = 0; i < n; i++) {
          adRows.push({
            user_id: userId,
            meta_ad_id_fk: uuid,
            meta_ad_id: ad.metaId,
            date: dates[i],
            spend: slice.spend[i],
            impressions: slice.impressions[i],
            clicks: slice.clicks[i],
            unique_clicks: Math.round(slice.clicks[i] * 0.9),
            ctr: slice.impressions[i] > 0 ? Math.round((slice.clicks[i] / slice.impressions[i]) * 10000) / 10000 : null,
            cpc: slice.clicks[i] > 0 ? Math.round((slice.spend[i] / slice.clicks[i]) * 10000) / 10000 : null,
            cpm: slice.impressions[i] > 0 ? Math.round((slice.spend[i] / (slice.impressions[i] / 1000)) * 10000) / 10000 : null,
            reach: Math.round(slice.impressions[i] * 0.7),
            frequency: 1.4,
            purchases: slice.purchases[i],
            leads: 0,
            revenue: slice.revenue[i],
            currency: CURRENCY,
            raw_actions: null,
            last_synced_at: now,
          });
        }
      }
    }
  }

  // Insert in batches of 500 rows.
  async function bulkInsert(table, rows) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supa.from(table).insert(batch);
      if (error) throw new Error(`${table} bulk insert: ${error.message}`);
    }
  }
  await bulkInsert("meta_ad_account_insights", aaRows);
  await bulkInsert("meta_campaign_insights", campaignRows);
  await bulkInsert("meta_adset_insights", adsetRows);
  await bulkInsert("meta_ad_insights", adRows);

  return {
    aaCount: aaRows.length,
    campaignCount: campaignRows.length,
    adsetCount: adsetRows.length,
    adCount: adRows.length,
  };
}

async function insertOrders(supa, userId, projectId, campaignIds, adsetIds, adIds, dates, scale) {
  const n = dates.length;
  const now = new Date().toISOString();
  const rows = [];

  // Each order carries the ad-level lineage (campaign / adset / ad) as
  // matched_meta_*_id and its UTM copy (utm_source=campaign_name,
  // utm_medium=adset_name, utm_campaign=ad_name — the platform UTM
  // contract in src/server/attribution/match-orders.ts).
  //
  // TZ totals are full-month projections; scale to what should have landed
  // by `daysCovered / daysInMonth` of the way through the month. This keeps
  // the ratio of coverage stable regardless of what day the seeder runs.
  for (const c of TREE) {
    for (const a of c.adsets) {
      for (const ad of a.ads) {
        const totalOrders = Math.round(ad.totals.orders * scale);
        if (totalOrders <= 0) continue;
        const revenueTotal = ad.totals.realRevenue * scale;
        // orders per day: integer split across n days
        const perDayOrderCount = splitInteger(totalOrders, n, `${ad.key}:orderCount`);
        // revenue slices: sum EXACTLY equal revenueTotal, distributed
        // proportional to the daily order count (days with 0 orders get 0).
        const revenueDaily = distributeProportional(revenueTotal, perDayOrderCount, `${ad.key}:orderRev`);
        for (let dayIdx = 0; dayIdx < n; dayIdx++) {
          const count = perDayOrderCount[dayIdx];
          if (count <= 0) continue;
          const perOrderRev = distributeEven(revenueDaily[dayIdx], count, `${ad.key}:o${dayIdx}`);
          for (let k = 0; k < count; k++) {
            const orderId = crypto.randomUUID();
            rows.push({
              user_id: userId,
              project_id: projectId,
              sales_source_id: null,
              order_date: dates[dayIdx],
              order_external_id: `demo-${ad.key}-${dayIdx}-${k}`,
              revenue: perOrderRev[k],
              currency: CURRENCY,
              customer_name: `Demo Customer ${orderId.slice(0, 8)}`,
              customer_email: `demo+${orderId.slice(0, 8)}@aurora.example`,
              product_name: ad.name,
              utm_source: c.name,
              utm_medium: a.name,
              utm_campaign: ad.name,
              utm_content: ad.metaId,
              utm_term: null,
              matched_meta_campaign_id: campaignIds.get(c.key),
              matched_meta_adset_id: adsetIds.get(a.key),
              matched_meta_ad_id: adIds.get(ad.key),
              attribution_status: "matched",
              attribution_matched_at: now,
              source_synced_at: now,
            });
          }
        }
      }
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supa.from("orders").insert(batch);
    if (error) throw new Error(`orders bulk insert: ${error.message}`);
  }
  return rows.length;
}

// distribute `total` across `n` buckets weighted by `weights` (0-safe).
function distributeProportional(total, weights, seed) {
  const n = weights.length;
  const wSum = weights.reduce((a, b) => a + b, 0);
  const scale = 100; // cents
  if (wSum === 0) return new Array(n).fill(0);
  const scaled = Math.round(total * scale);
  const raw = weights.map((w) => (w / wSum) * scaled);
  const rounded = raw.map((v) => Math.floor(v));
  let remainder = scaled - rounded.reduce((a, b) => a + b, 0);
  const bumpOrder = seededOrder(n, seed);
  let idx = 0;
  while (remainder > 0 && idx < n * 4) {
    const target = bumpOrder[idx % n];
    if (weights[target] > 0) {
      rounded[target] += 1;
      remainder -= 1;
    }
    idx += 1;
  }
  return rounded.map((v) => v / scale);
}

function distributeEven(total, n, seed) {
  return splitNumeric(total, n, seed, 2);
}

// ---------- verification (mirrors buildMonthlySnapshot + rules) ----------
async function verifyRules(supa, userId, projectId) {
  const range = thisMonthRangeUtc();
  const { since, until, dayOfMonth, daysInMonth } = range;
  if (!until) {
    console.log("  today is the 1st — no data window; skipping verify.");
    return;
  }
  const sinceIso = isoDate(since);
  const untilIso = isoDate(until);

  const [{ data: proj }, { data: aaLinks }] = await Promise.all([
    supa.from("projects").select("target_roas, monthly_revenue_goal, monthly_ad_budget, currency").eq("id", projectId).single(),
    supa
      .from("project_meta_ad_accounts")
      .select("meta_ad_account_id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("status", "active"),
  ]);
  const aaUuids = (aaLinks ?? []).map((r) => r.meta_ad_account_id).filter(Boolean);

  const [{ data: aaIns }, { data: campaigns }, { data: adsets }, { data: ads }, { data: orders }, { data: campIns }, { data: adsetIns }, { data: adIns }] =
    await Promise.all([
      supa
        .from("meta_ad_account_insights")
        .select("spend, purchases, revenue")
        .eq("user_id", userId)
        .in("meta_ad_account_id_fk", aaUuids)
        .gte("date", sinceIso)
        .lte("date", untilIso),
      supa
        .from("meta_campaigns")
        .select("id, campaign_name, effective_status, meta_ad_account_id")
        .in("meta_ad_account_id", aaUuids),
      supa
        .from("meta_adsets")
        .select("id, adset_name, meta_campaign_id_fk")
        .eq("user_id", userId),
      supa
        .from("meta_ads")
        .select("id, ad_name, meta_adset_id_fk")
        .eq("user_id", userId),
      supa
        .from("orders")
        .select("revenue, matched_meta_campaign_id, matched_meta_adset_id, matched_meta_ad_id")
        .eq("user_id", userId)
        .eq("project_id", projectId)
        .gte("order_date", sinceIso)
        .lte("order_date", untilIso),
      supa
        .from("meta_campaign_insights")
        .select("meta_campaign_id_fk, spend, purchases, revenue")
        .gte("date", sinceIso)
        .lte("date", untilIso),
      supa
        .from("meta_adset_insights")
        .select("meta_adset_id_fk, spend, purchases, revenue")
        .gte("date", sinceIso)
        .lte("date", untilIso),
      supa
        .from("meta_ad_insights")
        .select("meta_ad_id_fk, spend, purchases, revenue")
        .gte("date", sinceIso)
        .lte("date", untilIso),
    ]);

  const aaTot = { spend: 0, purchases: 0, revenue: 0 };
  for (const r of aaIns ?? []) {
    aaTot.spend += Number(r.spend) || 0;
    aaTot.purchases += Number(r.purchases) || 0;
    aaTot.revenue += Number(r.revenue) || 0;
  }
  let realRevenue = 0;
  let realOrders = 0;
  const ordersByCampaign = new Map();
  const ordersByAdset = new Map();
  const ordersByAd = new Map();
  for (const o of orders ?? []) {
    const rev = Number(o.revenue) || 0;
    realRevenue += rev;
    realOrders += 1;
    if (o.matched_meta_campaign_id) ordersByCampaign.set(o.matched_meta_campaign_id, (ordersByCampaign.get(o.matched_meta_campaign_id) || { revenue: 0, orders: 0 }));
    if (o.matched_meta_campaign_id) { const b = ordersByCampaign.get(o.matched_meta_campaign_id); b.revenue += rev; b.orders += 1; }
    if (o.matched_meta_adset_id) ordersByAdset.set(o.matched_meta_adset_id, (ordersByAdset.get(o.matched_meta_adset_id) || { revenue: 0, orders: 0 }));
    if (o.matched_meta_adset_id) { const b = ordersByAdset.get(o.matched_meta_adset_id); b.revenue += rev; b.orders += 1; }
    if (o.matched_meta_ad_id) ordersByAd.set(o.matched_meta_ad_id, (ordersByAd.get(o.matched_meta_ad_id) || { revenue: 0, orders: 0 }));
    if (o.matched_meta_ad_id) { const b = ordersByAd.get(o.matched_meta_ad_id); b.revenue += rev; b.orders += 1; }
  }

  // ---- attribution health ----
  const metaPurchases = aaTot.purchases;
  let coverage;
  let reliable;
  if (metaPurchases <= 0) {
    coverage = 1.0;
    reliable = true;
  } else {
    coverage = Math.max(0, Math.min(1, realOrders / metaPurchases));
    reliable = coverage >= RULE_TUNING.attributionReliableCoverage;
  }

  // ---- totals + plan ----
  const totals = {
    spend: aaTot.spend,
    metaRevenue: aaTot.revenue,
    purchases: aaTot.purchases,
    realRevenue,
    realOrders,
    realRoas: aaTot.spend > 0 ? realRevenue / aaTot.spend : null,
  };
  const plan = {
    targetRoas: Number(proj.target_roas) || 0,
    targetRevenue: Number(proj.monthly_revenue_goal) || 0,
    targetSpend: Number(proj.monthly_ad_budget) || 0,
    dayOfMonth,
    daysInMonth,
    proRatedTargetRevenue: (Number(proj.monthly_revenue_goal) || 0) * (dayOfMonth / daysInMonth),
  };

  // ---- per-campaign performance ----
  const campById = new Map();
  for (const c of campaigns ?? []) campById.set(c.id, c);
  const campaignAggs = new Map();
  for (const r of campIns ?? []) {
    if (!r.meta_campaign_id_fk) continue;
    const a = campaignAggs.get(r.meta_campaign_id_fk) || { spend: 0, purchases: 0, metaRevenue: 0 };
    a.spend += Number(r.spend) || 0;
    a.purchases += Number(r.purchases) || 0;
    a.metaRevenue += Number(r.revenue) || 0;
    campaignAggs.set(r.meta_campaign_id_fk, a);
  }
  const campaignPerf = [];
  for (const [id, a] of campaignAggs) {
    const b = ordersByCampaign.get(id) || { revenue: 0, orders: 0 };
    const c = campById.get(id) || {};
    campaignPerf.push({
      id, name: c.campaign_name || "?",
      spend: a.spend, purchases: a.purchases, metaRevenue: a.metaRevenue,
      metaRoas: a.spend > 0 ? a.metaRevenue / a.spend : null,
      realRevenue: b.revenue, realOrders: b.orders,
      realRoas: a.spend > 0 ? b.revenue / a.spend : null,
    });
  }
  const adsetById = new Map();
  for (const a of adsets ?? []) adsetById.set(a.id, a);
  const adsetAggs = new Map();
  for (const r of adsetIns ?? []) {
    if (!r.meta_adset_id_fk) continue;
    const a = adsetAggs.get(r.meta_adset_id_fk) || { spend: 0, purchases: 0, metaRevenue: 0 };
    a.spend += Number(r.spend) || 0;
    a.purchases += Number(r.purchases) || 0;
    a.metaRevenue += Number(r.revenue) || 0;
    adsetAggs.set(r.meta_adset_id_fk, a);
  }
  const adsetPerf = [];
  for (const [id, a] of adsetAggs) {
    const b = ordersByAdset.get(id) || { revenue: 0, orders: 0 };
    const s = adsetById.get(id) || {};
    adsetPerf.push({
      id, name: s.adset_name || "?", parentCampaignId: s.meta_campaign_id_fk,
      spend: a.spend, realRevenue: b.revenue,
      realRoas: a.spend > 0 ? b.revenue / a.spend : null,
    });
  }
  const adById = new Map();
  for (const a of ads ?? []) adById.set(a.id, a);
  const adAggs = new Map();
  for (const r of adIns ?? []) {
    if (!r.meta_ad_id_fk) continue;
    const a = adAggs.get(r.meta_ad_id_fk) || { spend: 0, purchases: 0, metaRevenue: 0 };
    a.spend += Number(r.spend) || 0;
    a.purchases += Number(r.purchases) || 0;
    a.metaRevenue += Number(r.revenue) || 0;
    adAggs.set(r.meta_ad_id_fk, a);
  }
  const adPerf = [];
  for (const [id, a] of adAggs) {
    const b = ordersByAd.get(id) || { revenue: 0, orders: 0 };
    const ad = adById.get(id) || {};
    adPerf.push({
      id, name: ad.ad_name || "?",
      spend: a.spend, realRevenue: b.revenue, realOrders: b.orders,
      realRoas: a.spend > 0 ? b.revenue / a.spend : null,
    });
  }

  // ---- run rules ----
  const issues = [];
  function push(id, sev, note) { issues.push({ id, sev, note, confidence: reliable ? "high" : "low" }); }

  // M0
  if (metaPurchases > 0 && coverage < RULE_TUNING.attributionWarningCoverage) {
    push("M0:month", "warning", `coverage ${coverage.toFixed(3)} < 0.3`);
  }

  // M1
  const ratio = plan.proRatedTargetRevenue > 0 ? totals.realRevenue / plan.proRatedTargetRevenue : null;
  if (ratio !== null && ratio < RULE_TUNING.revenueUndershootWarning) {
    const sev = ratio < RULE_TUNING.revenueUndershootCritical ? "critical" : "warning";
    push("M1:month", sev, `actual/proRated = ${ratio.toFixed(3)} (actual ${totals.realRevenue.toFixed(0)} vs pro-rated ${plan.proRatedTargetRevenue.toFixed(0)})`);
  }

  // M2
  if (plan.targetRoas > 0 && totals.realRoas !== null && totals.realRoas < plan.targetRoas * RULE_TUNING.roasCriticalMultiplier) {
    push("M2:month", "critical", `realRoas ${totals.realRoas.toFixed(3)} < ${(plan.targetRoas * 0.5).toFixed(3)}`);
  }

  // C1
  for (const c of campaignPerf) {
    if (c.realOrders === 0 && totals.spend > 0) {
      const share = c.spend / totals.spend;
      if (share >= RULE_TUNING.campaignSpendSignificance) {
        const sev = share >= RULE_TUNING.campaignSpendCriticalShare ? "critical" : "warning";
        push(`C1:${c.id}`, sev, `${c.name} — share ${(share * 100).toFixed(1)}%, real orders 0`);
      }
    }
  }

  // C2
  for (const c of campaignPerf) {
    if (totals.spend === 0) continue;
    const share = c.spend / totals.spend;
    if (c.metaRoas !== null && c.realRoas !== null &&
        c.metaRoas >= plan.targetRoas &&
        c.realRoas < plan.targetRoas * RULE_TUNING.metaOverstateRoasFloor &&
        share >= RULE_TUNING.metaOverstateSpendShare) {
      push(`C2:${c.id}`, "warning", `${c.name} — metaRoas ${c.metaRoas.toFixed(2)}, realRoas ${c.realRoas.toFixed(2)}`);
    }
  }

  // A1
  const adsetsByCampaign = new Map();
  for (const a of adsetPerf) {
    if (!a.parentCampaignId || a.realRoas === null) continue;
    const list = adsetsByCampaign.get(a.parentCampaignId) || [];
    list.push(a);
    adsetsByCampaign.set(a.parentCampaignId, list);
  }
  for (const [campaignId, list] of adsetsByCampaign) {
    if (list.length < 2) continue;
    const avg = list.reduce((sum, a) => sum + a.realRoas, 0) / list.length;
    const worst = list.reduce((min, a) => (a.realRoas < min.realRoas ? a : min));
    if (totals.spend === 0) continue;
    const share = worst.spend / totals.spend;
    if (worst.realRoas < avg * RULE_TUNING.adsetWeakRatio && share >= RULE_TUNING.adsetSpendShare) {
      push(`A1:${worst.id}`, "warning", `${worst.name} — realRoas ${worst.realRoas.toFixed(2)} vs avg ${avg.toFixed(2)} (poor ratio; share ${(share * 100).toFixed(1)}%)`);
    }
  }

  // AD1
  const eligible = adPerf.filter((a) => a.realRoas !== null && a.realRoas > 0 && a.realRevenue > 0);
  if (eligible.length > 0) {
    const best = eligible.reduce((m, a) => (a.realRoas > m.realRoas ? a : m));
    if (best.realRoas >= plan.targetRoas * RULE_TUNING.adOpportunityRoasMultiplier) {
      push(`AD1:${best.id}`, "opportunity", `${best.name} — realRoas ${best.realRoas.toFixed(2)} >= ${(plan.targetRoas * 1.5).toFixed(2)}`);
    }
  }

  // ---- report ----
  console.log("");
  console.log("─── Verification: this month, UTC ─────────────────────────────");
  console.log(`Range          : ${sinceIso} → ${untilIso}  (day ${dayOfMonth} of ${daysInMonth}; ${range.daysCovered} days covered)`);
  console.log(`totals.spend   : ${totals.spend.toFixed(2)}`);
  console.log(`totals.metaRev : ${totals.metaRevenue.toFixed(2)}`);
  console.log(`totals.purch   : ${totals.purchases}`);
  console.log(`totals.realOrd : ${totals.realOrders}`);
  console.log(`totals.realRev : ${totals.realRevenue.toFixed(2)}`);
  console.log(`totals.realRoas: ${totals.realRoas === null ? "null" : totals.realRoas.toFixed(3)}`);
  console.log(`coverage       : ${coverage.toFixed(4)}   reliable=${reliable}`);
  console.log("");
  console.log("Rules fired:");
  if (issues.length === 0) {
    console.log("  (none)");
  } else {
    for (const i of issues) {
      console.log(`  ${i.id.padEnd(20)} ${i.sev.padEnd(11)} conf=${i.confidence}  ${i.note}`);
    }
  }
  console.log("");

  // Explicit check against expected fires.
  const fired = new Set(issues.map((i) => i.id.split(":")[0]));
  const wanted = ["M1", "M2", "C1", "C2", "A1", "AD1"];
  const missing = wanted.filter((r) => !fired.has(r));
  const unexpected = [];
  if (fired.has("M0")) unexpected.push("M0");
  console.log(`Expected fires : ${wanted.join(", ")}   [M0 must NOT fire]`);
  console.log(`Fired          : ${[...fired].join(", ")}`);
  if (missing.length > 0) console.log(`MISSING        : ${missing.join(", ")}`);
  if (unexpected.length > 0) console.log(`UNEXPECTED     : ${unexpected.join(", ")}`);
  console.log("");
}

// ---------- main ----------
async function main() {
  const args = new Set(process.argv.slice(2));
  const verifyOnly = args.has("--verify");

  const env = loadEnv();
  const supa = createClient(env.url, env.key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log("Seed demo project — Aurora Cosmetics");
  console.log(`  supabase: ${env.url}`);
  console.log(`  user email: ${env.demoEmail}`);

  const userId = await ensureDemoUser(supa, env.demoEmail, env.demoPassword);
  console.log(`  demo userId: ${userId}`);

  if (verifyOnly) {
    const proj = await findRow(supa, "projects", { user_id: userId, name: PROJECT_NAME });
    if (!proj) {
      console.error("No project found for --verify; run without flag first.");
      process.exit(1);
    }
    await verifyRules(supa, userId, proj.id);
    return;
  }

  const projectId = await ensureProject(supa, userId);
  console.log(`  projectId: ${projectId}`);

  const connectionId = await ensureMetaConnection(supa, userId);
  const bmUuid = await ensureMetaBusinessManager(supa, userId, connectionId);
  const aaUuid = await ensureMetaAdAccount(supa, userId, bmUuid);
  const pmbmId = await ensureProjectBmMembership(supa, userId, projectId, connectionId, bmUuid);
  await ensureProjectAaSelection(supa, userId, projectId, pmbmId, aaUuid);
  console.log(`  wired connection/BM/AA and linked to project (status='active')`);

  const campaignIds = await upsertCampaigns(supa, userId, aaUuid);
  const adsetIds = await upsertAdsets(supa, userId, campaignIds);
  const adIds = await upsertAds(supa, userId, adsetIds);
  console.log(`  entities: ${campaignIds.size} campaigns, ${adsetIds.size} adsets, ${adIds.size} ads`);

  const range = thisMonthRangeUtc();
  if (!range.until) {
    console.log("  today is the 1st — no data window to seed. Rerun tomorrow.");
    return;
  }
  const dates = daysList(range.since, range.daysCovered);
  console.log(`  seeding daily rows: ${isoDate(range.since)} → ${isoDate(range.until)}  (${dates.length} days)`);

  const scale = range.daysCovered / range.daysInMonth;
  console.log(`  month scale: ${range.daysCovered}/${range.daysInMonth} = ${scale.toFixed(4)} of TZ full-month totals`);

  await wipeMonthlyInsightsAndOrders(supa, userId, projectId, aaUuid, campaignIds, adsetIds, adIds, range.since, range.until);
  const insightCounts = await insertInsights(supa, userId, aaUuid, campaignIds, adsetIds, adIds, dates, scale);
  console.log(`  insights: aa=${insightCounts.aaCount}, campaign=${insightCounts.campaignCount}, adset=${insightCounts.adsetCount}, ad=${insightCounts.adCount}`);
  const orderCount = await insertOrders(supa, userId, projectId, campaignIds, adsetIds, adIds, dates, scale);
  console.log(`  orders: ${orderCount}`);

  await verifyRules(supa, userId, projectId);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
