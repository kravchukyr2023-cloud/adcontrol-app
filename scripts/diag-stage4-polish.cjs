/* eslint-disable */
// One-shot read-only diagnostic for Sprint 6.5 Stage 4 (drawer entity polish).
//
// Run:
//   node scripts/diag-stage4-polish.cjs
//
// Fixed to project prefix 4509a1e6 and ad account d40326a8 per the task.
// Reads the freshest decision_explanations row for that project, then prints:
//   - created_at / computed_at
//   - schema_version, llm_used
//   - number of keys in entityPolish
//   - first 120 chars of each polish string
//   - SAME/DIFFERENT vs. the deterministic summary set from buildSummary()
//
// Nothing is mutated.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const PROJECT_PREFIX = "4509a1e6";
const AD_ACCOUNT_PREFIX = "d40326a8";

// Mirror of buildSummary() in src/lib/decisions/entity-diagnosis.ts (5 strings).
// If polish exactly matches one of these, it's SAME — the AI didn't rephrase.
const DETERMINISTIC_SUMMARIES = new Set([
  "Масштабуй — real ROAS перевищує ціль.",
  "Тримай і шукай де оптимізувати.",
  "Перегляньте таргет/креатив або поставте на паузу.",
  "Спочатку перевір UTM-трекінг — без нього виводи ненадійні.",
  "Слабкий трафік — зміни креатив або таргет.",
  "Пост-клік проблема — перевір лендінг та оффер.",
  "Без активності — перевір статус кампанії.",
]);

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

function trunc(s, n) {
  if (typeof s !== "string") return String(s);
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n# Stage 4 (drawer polish) diagnostic`);
  console.log(`# project prefix : ${PROJECT_PREFIX}`);
  console.log(`# ad account     : ${AD_ACCOUNT_PREFIX}`);

  // -----------------------------------------------------------------
  // Resolve the actual project id from the prefix.
  // -----------------------------------------------------------------
  // project.id is uuid — can't ilike. Use a UUID range covering the prefix.
  const uuidLow = `${PROJECT_PREFIX}-0000-0000-0000-000000000000`;
  const uuidHigh = `${PROJECT_PREFIX}-ffff-ffff-ffff-ffffffffffff`;
  const { data: projects, error: projErr } = await sb
    .from("projects")
    .select("*")
    .gte("id", uuidLow)
    .lte("id", uuidHigh);
  if (projErr) {
    console.error(`projects lookup failed: ${projErr.message}`);
    process.exit(1);
  }
  if (!projects || projects.length === 0) {
    console.error(`no project matches prefix ${PROJECT_PREFIX}`);
    process.exit(1);
  }
  // Detect which column holds the ad account id — schema varies over time.
  const sample = projects[0];
  const adAcctCol = ["meta_ad_account_id", "ad_account_id", "meta_account_id"].find(
    (c) => c in sample
  );
  console.log(`\n# candidate projects (${projects.length}):`);
  for (const p of projects) {
    console.log(
      `  - ${p.id}  name=${p.name ?? "?"}  ad_account=${adAcctCol ? p[adAcctCol] : "(no such column)"}`
    );
  }

  // Prefer the one matching the ad_account prefix if any.
  let project =
    (adAcctCol &&
      projects.find(
        (p) =>
          typeof p[adAcctCol] === "string" &&
          p[adAcctCol].replace(/^act_/, "").startsWith(AD_ACCOUNT_PREFIX)
      )) ||
    projects[0];
  console.log(`\n# using project=${project.id}  user=${project.user_id}`);

  // -----------------------------------------------------------------
  // Freshest decision_explanations row.
  // -----------------------------------------------------------------
  // Column set varies by migration — try wide select and let JS pick.
  const { data: rows, error: expErr } = await sb
    .from("decision_explanations")
    .select("*")
    .eq("project_id", project.id)
    .order("computed_at", { ascending: false })
    .limit(1);
  if (expErr) {
    console.error(`decision_explanations read failed: ${expErr.message}`);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log(
      `\nNO decision_explanations row for project ${project.id} — cron has never persisted an explanation.`
    );
    process.exit(0);
  }
  const row = rows[0];
  const exp = row.explanation || {};
  const polish = exp.entityPolish || {};
  const keys = Object.keys(polish);

  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`# decision_explanations row`);
  console.log(`──────────────────────────────────────────────────`);
  console.log(`id             : ${row.id}`);
  console.log(`month          : ${row.month}`);
  console.log(`created_at     : ${row.created_at ?? "(no column)"}`);
  console.log(`computed_at    : ${row.computed_at ?? "(no column)"}`);
  console.log(`updated_at     : ${row.updated_at ?? "(no column)"}`);
  console.log(`schema_version : ${exp.schemaVersion}`);
  console.log(`llm_used       : ${exp.llmUsed}`);
  console.log(`generatedAt    : ${exp.generatedAt}`);
  console.log(`entityPolish   : ${keys.length} key(s)`);

  if (keys.length > 0) {
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`# polish per entity (first 120 chars) + SAME/DIFFERENT`);
    console.log(`──────────────────────────────────────────────────`);
    let sameCount = 0;
    let differentCount = 0;
    for (const k of keys) {
      const value = polish[k];
      const trimmed = typeof value === "string" ? value.trim() : "";
      const isSame = DETERMINISTIC_SUMMARIES.has(trimmed);
      const marker = isSame ? "SAME     " : "DIFFERENT";
      if (isSame) sameCount++;
      else differentCount++;
      console.log(`  [${marker}] ${k}`);
      console.log(`             → ${trunc(value, 120)}`);
    }
    console.log(
      `\n# tally: SAME=${sameCount}  DIFFERENT=${differentCount}  total=${keys.length}`
    );
  }

  // -----------------------------------------------------------------
  // If llm_used=true but no polish → dump snapshot of candidates that
  // *would* have qualified per selectCandidates() in polish-entities.ts.
  // -----------------------------------------------------------------
  if (exp.llmUsed === true && keys.length === 0) {
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`# entityPolish empty despite llm_used=true — issues[] dump`);
    console.log(`──────────────────────────────────────────────────`);
    // We can only see the "linked_issues" gate from cached data:
    // decisions.issues[] isn't in the cache row (it's regenerated live),
    // so we count issue narratives as a proxy for how many entities the
    // engine surfaced.
    const issueExp = exp.issueExplanations || {};
    const issueIds = Object.keys(issueExp);
    console.log(`issueExplanations keys: ${issueIds.length}`);
    for (const id of issueIds) console.log(`  - ${id}`);
    console.log(
      `\nNote: scaleRecipe gate cannot be checked from the cache — that\n` +
        `signal is recomputed live from the snapshot. If you need it, run\n` +
        `evaluateSnapshot + diagnoseEntity in a full TS harness.`
    );
  }

  // -----------------------------------------------------------------
  // Verdict.
  // -----------------------------------------------------------------
  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`# PASS/FAIL summary`);
  console.log(`──────────────────────────────────────────────────`);
  const pass = (v) => (v ? "PASS" : "FAIL");
  const c1 = exp.schemaVersion === 8;
  const c2 = exp.llmUsed === true;
  const c3 = keys.length >= 1 && keys.length <= 15;
  const c4 =
    keys.length > 0 &&
    keys.every((k) => !DETERMINISTIC_SUMMARIES.has((polish[k] || "").trim()));
  console.log(`schema_version === 8          : ${pass(c1)}  (got ${exp.schemaVersion})`);
  console.log(`llm_used === true             : ${pass(c2)}  (got ${exp.llmUsed})`);
  console.log(`entityPolish keys in [1,15]   : ${pass(c3)}  (got ${keys.length})`);
  console.log(`all entries DIFFERENT         : ${pass(c4)}`);
  if (exp.llmUsed === false) {
    console.log(
      `\nNote: llm_used === false — expected self-heal fallback case. Fallback\n` +
        `is intentionally NOT persisted; the next successful cron pass will fill\n` +
        `this in. No fix needed.`
    );
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
