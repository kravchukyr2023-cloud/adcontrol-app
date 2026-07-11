/* eslint-disable */
// One-shot diagnostic for Decision Engine behaviour on empty / sparse data.
//
// Run:
//   node scripts/diag-empty-month.cjs
//
// Constructs four synthetic snapshots and runs JS ports of the rules
// (mirroring src/server/decisions/rules.ts) + the fallbackMonthlyPlan
// (src/server/decisions/explain.ts). Verifies:
//   - No NaN / Infinity / undefined in totals or facts
//   - No issues raised for "good" empty paths (zero spend, zero target)
//   - Sensible monthlyPlan fallback text
//   - Entity diagnosis (entity-diagnosis.ts logic ported) handles
//     no-impressions and missing peers cleanly
//
// Read-only — no DB access. Pure JS over synthetic structs.

const TUNING = {
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

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// --- mirrors src/server/decisions/rules.ts:deriveAttributionHealth ---
function deriveAttributionHealth(snapshot) {
  const metaPurchases = snapshot.totals.purchases;
  const realOrders = snapshot.totals.realOrders;
  if (metaPurchases <= 0) {
    return {
      coverage: 1,
      reliable: true,
      note: "Meta is not reporting purchases this month yet — attribution health will be computed once Meta records sales.",
    };
  }
  const coverage = Math.min(realOrders / metaPurchases, 1);
  return {
    coverage,
    reliable: coverage >= TUNING.attributionReliableCoverage,
    note: "(omitted in diag)",
  };
}

// --- mirrors each rule's early guard so we can prove no division ---
function runAllRules(snapshot) {
  const issues = [];
  const attribution = deriveAttributionHealth(snapshot);
  const { plan, totals } = snapshot;

  // M0
  if (totals.purchases > 0 && attribution.coverage < TUNING.attributionWarningCoverage) {
    issues.push({ ruleId: "M0_attribution_health" });
  }
  // M1
  if (plan.proRatedTargetRevenue > 0) {
    const ratio = totals.realRevenue / plan.proRatedTargetRevenue;
    if (ratio < TUNING.revenueUndershootWarning) {
      issues.push({
        ruleId: "M1_revenue_undershoot",
        ratio,
        pctOfTarget: Math.round(ratio * 100),
      });
    }
  }
  // M2
  if (
    plan.targetRoas > 0 &&
    totals.realRoas !== null &&
    totals.realRoas < plan.targetRoas * TUNING.roasCriticalMultiplier
  ) {
    issues.push({ ruleId: "M2_roas_below_floor" });
  }
  // C1 — requires totalSpend > 0
  if (totals.spend > 0) {
    for (const c of snapshot.campaigns) {
      if (c.realOrders > 0) continue;
      const share = c.spend / totals.spend;
      if (share >= TUNING.campaignSpendSignificance) {
        issues.push({ ruleId: "C1_campaign_burned_budget", campaign: c.name, share });
      }
    }
  }
  // C2 — requires targetRoas > 0 AND totals.spend > 0
  if (plan.targetRoas > 0 && totals.spend > 0) {
    for (const c of snapshot.campaigns) {
      if (c.realRoas === null || c.metaRoas === null) continue;
      // omitted further checks
    }
  }
  // A1 — requires totalSpend > 0
  if (totals.spend > 0 && snapshot.adsets.length > 0) {
    // omitted
  }
  // AD1 — requires targetRoas > 0
  if (plan.targetRoas > 0 && snapshot.ads.length > 0) {
    // omitted
  }

  return { issues, attribution };
}

function evaluateSnapshot(snapshot) {
  const { issues, attribution } = runAllRules(snapshot);
  const summary = {
    totalIssues: issues.length,
    critical: 0,
    warning: 0,
    opportunity: 0,
    info: 0,
  };
  return { issues, attributionHealth: attribution, summary };
}

// --- port of fallbackMonthlyPlan (explain.ts) ---
function pct(ratio) {
  return `${Math.round(ratio * 100)}%`;
}
function money(currency, amount) {
  return `${round2(amount)} ${currency}`;
}
function daysWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
}
function fallbackMonthlyPlan(snapshot, decisions) {
  const { plan, totals, currency } = snapshot;
  const parts = [];
  if (!decisions.attributionHealth.reliable) {
    parts.push(
      `Real-цифри неповні (${pct(decisions.attributionHealth.coverage)} Meta purchases підтверджено орендами) — це орієнтири.`
    );
  }
  if (plan.proRatedTargetRevenue > 0) {
    const ratio = totals.realRevenue / plan.proRatedTargetRevenue;
    parts.push(
      `Real revenue MTD ${money(currency, totals.realRevenue)} з прогнозованих на сьогодні ${money(
        currency,
        plan.proRatedTargetRevenue
      )} (${pct(ratio)} плану).`
    );
  } else if (totals.realRevenue > 0) {
    parts.push(`Real revenue MTD ${money(currency, totals.realRevenue)}.`);
  }
  if (totals.realRoas !== null && plan.targetRoas > 0) {
    parts.push(
      `Real ROAS ×${round2(totals.realRoas)} проти цілі ×${round2(plan.targetRoas)}.`
    );
  } else if (totals.realRoas !== null) {
    parts.push(`Real ROAS ×${round2(totals.realRoas)}.`);
  }
  const daysLeft = Math.max(plan.daysInMonth - plan.dayOfMonth, 0);
  parts.push(`Залишилось ${daysLeft} ${daysWord(daysLeft)} до кінця місяця.`);
  if (decisions.summary.critical > 0) {
    parts.push(`Критичних issues: ${decisions.summary.critical}; warnings: 0.`);
  } else if (decisions.summary.totalIssues > 0) {
    parts.push(`Issues для уваги: ${decisions.summary.totalIssues}.`);
  }
  return parts.join(" ");
}

// --- entity-diagnosis port (just the math, to verify null-safety) ---
function safeDivide(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const v = a / b;
  return Number.isFinite(v) ? v : null;
}
function diagnoseEntityMath(entity, peer) {
  const ctr = safeDivide(entity.clicks, entity.impressions);
  const cpc = safeDivide(entity.spend, entity.clicks);
  const cpm = entity.impressions > 0 ? (entity.spend / entity.impressions) * 1000 : null;
  return { ctr, cpc, cpm, peer };
}

// --- snapshot builders for the scenarios ---
function basePlan(targetRevenue = 0, targetSpend = 0, targetRoas = 0, targetCpa = 0) {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const fraction = dayOfMonth / daysInMonth;
  const proRate = (t) => (t > 0 ? t * fraction : 0);
  return {
    targetRevenue,
    targetSpend,
    targetRoas,
    targetCpa,
    daysInMonth,
    dayOfMonth,
    proRatedTargetRevenue: proRate(targetRevenue),
    proRatedTargetSpend: proRate(targetSpend),
    monthStart: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`,
    monthEnd: now.toISOString().slice(0, 10),
  };
}
function zeroTotals() {
  return {
    spend: 0,
    realRevenue: 0,
    realOrders: 0,
    realRoas: null,
    metaRevenue: 0,
    purchases: 0,
  };
}
function emptySnapshot(plan) {
  return {
    projectId: "x",
    projectName: "x",
    currency: "USD",
    plan,
    totals: zeroTotals(),
    adAccounts: [],
    campaigns: [],
    adsets: [],
    ads: [],
    dataCompleteness: { adInsightsCoverage: 1, totalAds: 0, adsWithInsights: 0, note: "" },
  };
}

// --- scenarios ---
const SCENARIOS = [
  {
    name: "A. Brand-new project, no AAs, no targets",
    snapshot: emptySnapshot(basePlan()),
  },
  {
    name: "B. New project with targets set, zero MTD activity",
    snapshot: emptySnapshot(basePlan(10000, 3000, 3, 35)),
  },
  {
    name: "C. AAs connected, campaigns array empty (no insights yet)",
    snapshot: {
      ...emptySnapshot(basePlan(10000, 3000, 3, 35)),
      adAccounts: [
        { id: "aa1", name: "Test AA", spend: 0, realRevenue: 0, metaRevenue: 0, realRoas: null },
      ],
    },
  },
  {
    name: "D. Day 1 with one campaign no orders, no purchases yet",
    snapshot: (() => {
      const plan = basePlan(10000, 3000, 3, 35);
      return {
        ...emptySnapshot(plan),
        totals: {
          spend: 50,
          realRevenue: 0,
          realOrders: 0,
          realRoas: null,
          metaRevenue: 0,
          purchases: 0,
        },
        campaigns: [
          {
            id: "c1",
            name: "Test campaign",
            spend: 50,
            impressions: 100,
            clicks: 2,
            purchases: 0,
            metaRevenue: 0,
            metaRoas: null,
            realRevenue: 0,
            realOrders: 0,
            realRoas: null,
          },
        ],
      };
    })(),
  },
];

function findUnsafe(obj, pathPrefix = "") {
  const findings = [];
  if (obj === null || obj === undefined) return findings;
  if (typeof obj === "number") {
    if (Number.isNaN(obj)) findings.push(`${pathPrefix}: NaN`);
    else if (!Number.isFinite(obj)) findings.push(`${pathPrefix}: Infinity`);
    return findings;
  }
  if (typeof obj !== "object") return findings;
  for (const [k, v] of Object.entries(obj)) {
    findings.push(...findUnsafe(v, pathPrefix ? `${pathPrefix}.${k}` : k));
  }
  return findings;
}

function run() {
  for (const sc of SCENARIOS) {
    console.log("\n──────────────────────────────────────────────────");
    console.log(sc.name);
    console.log("──────────────────────────────────────────────────");
    const decisions = evaluateSnapshot(sc.snapshot);
    console.log(`issues: ${decisions.issues.length}`);
    if (decisions.issues.length > 0) console.log(JSON.stringify(decisions.issues, null, 2));
    console.log(
      `attribution: coverage=${decisions.attributionHealth.coverage} reliable=${decisions.attributionHealth.reliable}`
    );
    const plan = fallbackMonthlyPlan(sc.snapshot, decisions);
    console.log(`monthlyPlan (fallback): "${plan}"`);
    const unsafeT = findUnsafe(sc.snapshot.totals, "totals");
    if (unsafeT.length) console.log(`UNSAFE in totals: ${unsafeT.join(", ")}`);
    else console.log("totals: safe (no NaN/Infinity)");

    // Per-entity diagnosis on every campaign in scenario.
    for (const c of sc.snapshot.campaigns) {
      const m = diagnoseEntityMath(c, { ctr: null, cpc: null, cpm: null });
      const unsafe = findUnsafe(m, `entity[${c.id}]`);
      console.log(
        `entity ${c.id}: ctr=${m.ctr} cpc=${m.cpc} cpm=${m.cpm}` +
          (unsafe.length ? ` UNSAFE: ${unsafe.join(", ")}` : "")
      );
    }
  }
  console.log("\n──────────────────────────────────────────────────\n");
}
run();
