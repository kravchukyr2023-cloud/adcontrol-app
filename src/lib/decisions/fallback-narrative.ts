// Client-safe deterministic narrative builder.
//
// Lives outside `src/server/decisions/explain.ts` (which is "server-only")
// specifically so the drawer can produce a narrative when the cached AI
// explanation hasn't caught up yet. The functions here are pure — no IO,
// no env, no Supabase — so the lack of the `server-only` guard is correct.
//
// Single source of truth: the server-side `explainDecisions` fallback path
// imports this same function, so the deterministic narrative we render on
// the client is identical (verbatim) to the one the server would write to
// the cache when the LLM is offline.

import type {
  DecisionIssue,
  IssueNarrative,
} from "@/server/decisions/types";

/**
 * Deterministic 4-section narrative built from issue.facts +
 * recommendedAction. Drier than the LLM version on purpose — the goal is
 * "always correct, never empty", not "well-written".
 */
export function fallbackNarrative(issue: DecisionIssue): IssueNarrative {
  return {
    impact: fallbackImpact(issue),
    diagnosis: fallbackDiagnosis(issue),
    action: issue.recommendedAction,
    expectedResult: fallbackExpectedResult(issue.ruleId),
  };
}

function fallbackImpact(issue: DecisionIssue): string {
  const severityLabel = severityUa(issue.severity);
  const levelLabel = levelUa(issue.level);
  const entity = issue.entityName ? ` (${issue.entityName})` : "";
  return `${severityLabel} ${levelLabel}${entity}: ${issue.title}.`;
}

function fallbackDiagnosis(issue: DecisionIssue): string {
  const top = issue.facts
    .slice(0, 3)
    .filter((f) => f.value !== null && f.value !== "")
    .map((f) => `${f.label}: ${f.value}`)
    .join("; ");
  return top
    ? `Ключові показники — ${top}.`
    : "Деталі — у фактах rules engine.";
}

/**
 * Rule-keyed "what will improve" templates. Generic catch-all for unknown
 * rule ids so a future rule never produces an empty expectedResult.
 */
function fallbackExpectedResult(ruleId: string): string {
  switch (ruleId) {
    case "M0_attribution_health":
      return "Real-аналіз стане точним, і подальші поради спиратимуться на підтверджені дані.";
    case "M1_revenue_undershoot":
      return "Темп real revenue наблизиться до плану до кінця місяця.";
    case "M2_roas_below_floor":
      return "Real ROAS підтягнеться до цільового рівня.";
    case "C1_campaign_burned_budget":
      return "Бюджет звільниться під real-прибуткові кампанії.";
    case "C2_meta_overstates":
      return "Гроші переключаться на кампанії, де real-продажі підтверджені.";
    case "A1_adset_weak_link":
      return "Кампанія підтягне середній real ROAS після перерозподілу між адсетами.";
    case "AD1_ad_opportunity":
      return "При масштабуванні оголошення real revenue зросте пропорційно.";
    default:
      return "Цільова метрика покращиться після виконання дії.";
  }
}

function severityUa(s: DecisionIssue["severity"]): string {
  switch (s) {
    case "critical":
      return "Критичний сигнал";
    case "warning":
      return "Попередження";
    case "opportunity":
      return "Можливість";
    case "info":
      return "Інформація";
  }
}

function levelUa(l: DecisionIssue["level"]): string {
  switch (l) {
    case "month":
      return "місячного рівня";
    case "campaign":
      return "по кампанії";
    case "adset":
      return "по адсету";
    case "ad":
      return "по оголошенню";
  }
}
