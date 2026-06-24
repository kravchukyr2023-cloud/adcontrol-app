import "server-only";
import { buildMonthlySnapshot } from "@/server/decisions/monthly-snapshot";
import { evaluateSnapshot } from "@/server/decisions/evaluate";
import { explainDecisions } from "@/server/decisions/explain";
import {
  currentMonthKey,
  getCachedExplanation,
  saveExplanation,
} from "@/server/decisions/explanation-cache";
import type {
  DecisionExplanation,
  DecisionResult,
  MonthlySnapshot,
} from "@/server/decisions/types";

/**
 * Stage 32 — single point of assembly for /api/decisions and its legacy
 * alias /api/decisions/snapshot.
 *
 * Contract:
 *   - snapshot + decisions are ALWAYS recomputed (cheap, deterministic).
 *   - explanation is read from the decision_explanations cache when
 *     present, otherwise generated live + saved.
 *   - `refresh=true` forces a fresh LLM call and a cache overwrite — the
 *     "Оновити" button in the UI uses this.
 *
 * Failures inside explainDecisions are absorbed there (it never throws);
 * we still save the fallback to the cache so subsequent reads are fast
 * even when the LLM stayed offline. Stage 32 cron will overwrite it on
 * the next successful run.
 */

export type DecisionsResponse = {
  snapshot: MonthlySnapshot;
  decisions: DecisionResult;
  explanation: DecisionExplanation;
  meta: {
    explanationFromCache: boolean;
    explanationComputedAt: string;
    month: string;
  };
};

export async function assembleDecisions(args: {
  userId: string;
  projectId: string;
  refresh: boolean;
}): Promise<DecisionsResponse> {
  const { userId, projectId, refresh } = args;

  const snapshot = await buildMonthlySnapshot({ userId, projectId });
  const decisions = evaluateSnapshot(snapshot);

  // Month key is taken from the snapshot's monthStart to guarantee the
  // cache key matches whatever window the builder actually used — no risk
  // of drifting if `thisMonthRangeUtc` changes later.
  const month = snapshot.plan.monthStart.slice(0, 7);

  let explanation: DecisionExplanation | null = null;
  let fromCache = false;

  if (!refresh) {
    explanation = await getCachedExplanation({ userId, projectId, month });
    if (explanation) fromCache = true;
  }

  if (!explanation) {
    explanation = await explainDecisions({ snapshot, decisions });
    // Save even fallback (llmUsed=false) explanations so the UI is fast
    // even when the LLM is offline. The cron will overwrite with a real
    // one as soon as the LLM is back.
    await saveExplanation({ userId, projectId, month, explanation });
  }

  return {
    snapshot,
    decisions,
    explanation,
    meta: {
      explanationFromCache: fromCache,
      explanationComputedAt: explanation.generatedAt,
      month,
    },
  };
}

export { currentMonthKey };
