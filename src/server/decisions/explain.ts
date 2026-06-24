import "server-only";
import {
  callLlm,
  LlmAuthError,
  LlmError,
  LlmRateLimitError,
  LlmUnavailableError,
} from "@/lib/llm/client";
import { isMissingEnvError } from "@/server/env";
import type {
  DecisionExplanation,
  DecisionResult,
  MonthlySnapshot,
} from "@/server/decisions/types";

/**
 * Stage 31 — AI explainer.
 *
 * Takes the deterministic Decision Engine output (snapshot + decisions) and
 * produces a human-readable Ukrainian summary plus per-issue one-liners.
 *
 * Invariants:
 *   1. The AI never computes numbers. Every figure it can quote is already
 *      a `fact.value` we hand it. If the LLM hallucinates a number, that's
 *      a bug — the rules engine must surface the fact, not the AI.
 *   2. Graceful degradation. Any LLM failure path (missing key, quota
 *      exhausted, network, malformed JSON) returns `llmUsed: false` plus a
 *      terse template — the brain still functions, it just stops being
 *      pretty. This is the Stage 34 promise, baked in from the start.
 *
 * No caching here (Stage 32). Each call hits the LLM live.
 */

const SYSTEM_PROMPT = `Ти — асистент медіа-баєра у платформі AdControl. Аналізуєш місяць рекламних кампаній.

Стиль:
- Природна українська (рівень Stripe/Notion). Без машинного перекладу і кальок.
- Конкретно і коротко. Без води, без маркетингових кліше ("оптимізуйте", "розкрийте потенціал", "досягніть успіху").
- Будь прямим: "real ROAS впав до 0.4 — постав адсет X на паузу" краще ніж "розгляньте варіанти оптимізації".

Інваріант: ти можеш вживати ТІЛЬКИ числа, які я даю у facts і totals. Не рахуй нові числа і не вигадуй їх. Якщо потрібного числа немає — обійдися без нього.

Якщо attribution coverage низький (reliable=false) — обов'язково почни monthlyPlan з застереження: real-цифри неповні через трекінг, тому це орієнтири, а не остаточний вердикт.

Поверни ЛИШЕ валідний JSON у форматі:
{
  "monthlyPlan": "2-4 речення загального плану місяця",
  "issues": {
    "<id>": "1-2 речення пояснення цього issue, що робити далі"
  }
}

Без markdown-розмітки, без коментарів, без жодного тексту поза JSON.`;

/** Soft cap on tokens for the JSON reply — fits ≈ 15 issues + 4-sentence plan. */
const MAX_TOKENS = 1200;

export async function explainDecisions(args: {
  snapshot: MonthlySnapshot;
  decisions: DecisionResult;
}): Promise<DecisionExplanation> {
  const { snapshot, decisions } = args;
  const userPrompt = buildUserPrompt(snapshot, decisions);

  let raw: string;
  try {
    raw = await callLlm({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: MAX_TOKENS,
      temperature: 0.4,
    });
  } catch (err) {
    return logAndFallback(err, snapshot, decisions);
  }

  const parsed = parseLlmJson(raw);
  if (!parsed) {
    console.warn("[explain] LLM returned unparseable JSON — falling back");
    return fallbackExplanation(snapshot, decisions);
  }

  const monthlyPlan =
    typeof parsed.monthlyPlan === "string" && parsed.monthlyPlan.trim().length > 0
      ? parsed.monthlyPlan.trim()
      : fallbackMonthlyPlan(snapshot, decisions);

  // Filter to issues the rules engine actually emitted. Drops hallucinated
  // ids, keeps only strings, trims whitespace. Missing entries are fine —
  // the UI falls back to issue.recommendedAction.
  const validIds = new Set(decisions.issues.map((i) => i.id));
  const issueExplanations: Record<string, string> = {};
  const rawIssues = parsed.issues ?? {};
  for (const [id, text] of Object.entries(rawIssues)) {
    if (!validIds.has(id)) continue;
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    if (!trimmed) continue;
    issueExplanations[id] = trimmed;
  }

  return {
    monthlyPlan,
    issueExplanations,
    generatedAt: new Date().toISOString(),
    llmUsed: true,
  };
}

// ===========================================================================
// Prompt construction. Keep the user message dense: only facts the rules
// engine already certified, no descriptive prose for the AI to imitate.
// ===========================================================================

function buildUserPrompt(
  snapshot: MonthlySnapshot,
  decisions: DecisionResult
): string {
  const { plan, totals, currency } = snapshot;
  const lines: string[] = [];

  lines.push(`PROJECT: ${snapshot.projectName}`);
  lines.push(`CURRENCY: ${currency}`);
  lines.push(`MONTH WINDOW: ${plan.monthStart} → ${plan.monthEnd} (day ${plan.dayOfMonth} of ${plan.daysInMonth})`);
  lines.push("");

  lines.push("PLAN:");
  lines.push(`  target_revenue_month: ${plan.targetRevenue}`);
  lines.push(`  target_revenue_pro_rated_today: ${round2(plan.proRatedTargetRevenue)}`);
  lines.push(`  target_spend_month: ${plan.targetSpend}`);
  lines.push(`  target_spend_pro_rated_today: ${round2(plan.proRatedTargetSpend)}`);
  lines.push(`  target_roas: ${plan.targetRoas}`);
  lines.push(`  target_cpa: ${plan.targetCpa}`);
  lines.push("");

  lines.push("TOTALS (month-to-date):");
  lines.push(`  spend: ${round2(totals.spend)}`);
  lines.push(`  real_revenue: ${round2(totals.realRevenue)}`);
  lines.push(`  real_orders: ${totals.realOrders}`);
  lines.push(`  real_roas: ${totals.realRoas === null ? "null" : round2(totals.realRoas)}`);
  lines.push(`  meta_revenue: ${round2(totals.metaRevenue)}`);
  lines.push(`  meta_purchases: ${totals.purchases}`);
  lines.push("");

  lines.push("ATTRIBUTION HEALTH:");
  lines.push(`  coverage: ${round2(decisions.attributionHealth.coverage)}`);
  lines.push(`  reliable: ${decisions.attributionHealth.reliable}`);
  lines.push(`  note: ${decisions.attributionHealth.note}`);
  lines.push("");

  lines.push(`ISSUES (${decisions.issues.length}):`);
  if (decisions.issues.length === 0) {
    lines.push("  (none)");
  }
  for (const issue of decisions.issues) {
    lines.push(`- id: ${issue.id}`);
    lines.push(`  rule: ${issue.ruleId}`);
    lines.push(`  severity: ${issue.severity}`);
    lines.push(`  level: ${issue.level}`);
    if (issue.entityName) lines.push(`  entity: ${issue.entityName}`);
    if (issue.parentContext) lines.push(`  parent: ${issue.parentContext}`);
    lines.push(`  title: ${issue.title}`);
    lines.push(`  confidence: ${issue.confidence}`);
    lines.push(`  recommended_action: ${issue.recommendedAction}`);
    lines.push(`  facts:`);
    for (const f of issue.facts) {
      lines.push(`    - ${f.label}: ${f.value === null ? "null" : f.value}`);
    }
  }

  return lines.join("\n");
}

// ===========================================================================
// JSON parsing — tolerant to ```json fences but no further reformatting.
// ===========================================================================

type LlmJson = {
  monthlyPlan?: unknown;
  issues?: Record<string, unknown>;
};

function parseLlmJson(raw: string): LlmJson | null {
  // Strip ```json … ``` or plain ``` … ``` fences if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    const parsed = JSON.parse(candidate) as LlmJson;
    return parsed;
  } catch {
    return null;
  }
}

// ===========================================================================
// Fallback templating — deterministic, runs when the LLM is unavailable.
// ===========================================================================

function logAndFallback(
  err: unknown,
  snapshot: MonthlySnapshot,
  decisions: DecisionResult
): DecisionExplanation {
  let reason: string;
  if (isMissingEnvError(err)) reason = `missing env ${err.variable}`;
  else if (err instanceof LlmAuthError) reason = `auth: ${err.message}`;
  else if (err instanceof LlmRateLimitError) reason = `rate/quota: ${err.message}`;
  else if (err instanceof LlmUnavailableError) reason = `unavailable: ${err.message}`;
  else if (err instanceof LlmError) reason = `llm: ${err.message}`;
  else if (err instanceof Error) reason = `unexpected: ${err.message}`;
  else reason = "unknown error";
  console.warn(`[explain] LLM unavailable, falling back: ${reason}`);
  return fallbackExplanation(snapshot, decisions);
}

function fallbackExplanation(
  snapshot: MonthlySnapshot,
  decisions: DecisionResult
): DecisionExplanation {
  return {
    monthlyPlan: fallbackMonthlyPlan(snapshot, decisions),
    issueExplanations: {},
    generatedAt: new Date().toISOString(),
    llmUsed: false,
  };
}

/**
 * Compact, all-numeric Ukrainian summary built from snapshot facts only.
 * Intentionally drier than the LLM version — the goal is "always correct,
 * never empty", not "well-written".
 */
function fallbackMonthlyPlan(
  snapshot: MonthlySnapshot,
  decisions: DecisionResult
): string {
  const { plan, totals, currency } = snapshot;
  const parts: string[] = [];

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
    parts.push(
      `Критичних issues: ${decisions.summary.critical}; warnings: ${decisions.summary.warning}.`
    );
  } else if (decisions.summary.totalIssues > 0) {
    parts.push(
      `Issues для уваги: ${decisions.summary.totalIssues} (warnings ${decisions.summary.warning}, opportunities ${decisions.summary.opportunity}).`
    );
  }

  return parts.join(" ");
}

// ===========================================================================
// Tiny formatting helpers — kept local so the file is self-contained.
// ===========================================================================

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function money(currency: string, amount: number): string {
  // Ad-hoc — Intl.NumberFormat would be fine but we don't need locale-aware
  // formatting in a server-side string we'll render verbatim in the UI.
  return `${round2(amount)} ${currency}`;
}

function daysWord(n: number): string {
  // Cheap Ukrainian plural — "день / дні / днів". Good enough for the
  // fallback string; the LLM version writes natural prose anyway.
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
}

/** Exported strictly for tests / future Stage 32 cache key hashing. */
export const __internals = {
  buildUserPrompt,
  parseLlmJson,
  fallbackMonthlyPlan,
};