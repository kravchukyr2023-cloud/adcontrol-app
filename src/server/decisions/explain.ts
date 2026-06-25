import "server-only";
import {
  callLlm,
  LlmAuthError,
  LlmError,
  LlmRateLimitError,
  LlmUnavailableError,
} from "@/lib/llm/client";
import { isMissingEnvError } from "@/server/env";
import {
  EXPLANATION_SCHEMA_VERSION,
  type DecisionExplanation,
  type DecisionIssue,
  type DecisionResult,
  type IssueNarrative,
  type MonthlySnapshot,
} from "@/server/decisions/types";
import { fallbackNarrative } from "@/lib/decisions/fallback-narrative";

/**
 * Stage 31 + 33a — AI explainer.
 *
 * Produces a Ukrainian narrative over the deterministic Decision Engine
 * output. Each issue gets a 4-section IssueNarrative (impact / diagnosis /
 * action / expectedResult). monthlyPlan is a 2–4 sentence summary.
 *
 * Invariants:
 *   1. The AI never computes numbers. Every figure it can quote is already
 *      a `fact.value` we hand it. If the LLM hallucinates a number, that's
 *      a bug — the rules engine must surface the fact, not the AI.
 *   2. Graceful degradation. Any LLM failure path (missing key, quota
 *      exhausted, network, malformed JSON) returns `llmUsed: false` plus a
 *      deterministic 4-section template per issue — the brain still works.
 *   3. Per-field tolerance. If the LLM omits one of the four narrative
 *      fields for an issue, we fill that single field from the fallback;
 *      we do not discard the whole issue.
 *
 * No caching here (Stage 32 lives in explanation-cache.ts). Each call hits
 * the LLM live.
 */

const SYSTEM_PROMPT = `Ти — асистент медіа-баєра у платформі AdControl. Аналізуєш місяць рекламних кампаній.

Стиль:
- Природна українська (рівень Stripe/Notion). Без машинного перекладу, без кальок.
- Конкретно і коротко. Без води, без маркетингових кліше ("оптимізуйте", "розкрийте потенціал", "досягніть успіху").
- Будь прямим. Кожне поле — 1-2 короткі речення.

Інваріант: ти можеш вживати ТІЛЬКИ числа, які я даю у facts і totals. Не рахуй нові числа, не вигадуй їх. Якщо потрібного числа немає — обійдися без нього.

Якщо attribution coverage низький (reliable=false) — обов'язково почни monthlyPlan з застереження: real-цифри неповні через трекінг, тому це орієнтири, а не остаточний вердикт.

Для КОЖНОГО issue поверни 4 поля:
- impact: що це означає для бізнесу / наслідок (1-2 речення).
- diagnosis: чому так сталося, спираючись на цифри з facts (1-2 речення).
- action: конкретний наступний крок. Якщо в issue є recommended_action — переформулюй його природно тією ж сутністю, не вигадуй нову дію (1-2 речення).
- expectedResult: що покращиться, якщо виконати action (1-2 речення).

Поверни ЛИШЕ валідний JSON у форматі:
{
  "monthlyPlan": "2-4 речення загального плану місяця",
  "issues": {
    "<id>": {
      "impact": "…",
      "diagnosis": "…",
      "action": "…",
      "expectedResult": "…"
    }
  }
}

Без markdown-розмітки, без коментарів, без жодного тексту поза JSON.`;

/** Token budget for the JSON reply — 4 fields × ~15 issues + 4-sentence plan. */
const MAX_TOKENS = 1600;

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

  // Build narratives only for ids the rules engine actually emitted. For each
  // issue, missing fields are backfilled from the deterministic fallback so
  // an LLM that omits a single field doesn't collapse the whole issue card.
  const issuesById = new Map<string, DecisionIssue>();
  for (const i of decisions.issues) issuesById.set(i.id, i);

  const rawIssues = (parsed.issues ?? {}) as Record<string, unknown>;
  const issueExplanations: Record<string, IssueNarrative> = {};
  for (const issue of decisions.issues) {
    const fallback = fallbackNarrative(issue);
    const aiEntry = rawIssues[issue.id];
    if (aiEntry && typeof aiEntry === "object") {
      issueExplanations[issue.id] = mergeNarrative(
        aiEntry as Record<string, unknown>,
        fallback
      );
    } else {
      issueExplanations[issue.id] = fallback;
    }
  }

  return {
    schemaVersion: EXPLANATION_SCHEMA_VERSION,
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

/**
 * Per-field fallback merge. The AI may legitimately omit one of the four
 * fields for some issues (e.g. an opportunity issue may not have a strong
 * "impact" framing). We never drop the issue — we just patch the missing
 * field from the deterministic template.
 */
function mergeNarrative(
  ai: Record<string, unknown>,
  fallback: IssueNarrative
): IssueNarrative {
  return {
    impact: pickString(ai.impact) ?? fallback.impact,
    diagnosis: pickString(ai.diagnosis) ?? fallback.diagnosis,
    action: pickString(ai.action) ?? fallback.action,
    expectedResult: pickString(ai.expectedResult) ?? fallback.expectedResult,
  };
}

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const issueExplanations: Record<string, IssueNarrative> = {};
  for (const issue of decisions.issues) {
    issueExplanations[issue.id] = fallbackNarrative(issue);
  }
  return {
    schemaVersion: EXPLANATION_SCHEMA_VERSION,
    monthlyPlan: fallbackMonthlyPlan(snapshot, decisions),
    issueExplanations,
    generatedAt: new Date().toISOString(),
    llmUsed: false,
  };
}

/**
 * Compact, all-numeric Ukrainian summary built from snapshot facts only.
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
  return `${round2(amount)} ${currency}`;
}

function daysWord(n: number): string {
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
  fallbackNarrative,
};
