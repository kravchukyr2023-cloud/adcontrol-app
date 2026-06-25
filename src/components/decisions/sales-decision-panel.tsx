"use client";

import { useMemo, useState } from "react";
import { useDecisions } from "@/hooks/use-decisions";
import { ATTRIBUTION_RULE_IDS } from "@/server/decisions/rule-ids";
import IssueCard from "@/components/decisions/issue-card";
import { fallbackNarrative } from "@/lib/decisions/fallback-narrative";

/**
 * Stage 33c — Sales & Attribution surface of the Decision Engine.
 *
 * Same hook + IssueCard as the Dashboard section, but:
 *   - no tabs (flat list — this surface focuses on attribution),
 *   - issues filtered to ATTRIBUTION_RULE_IDS,
 *   - no AI monthly plan / progress bar (those are Dashboard-specific —
 *     here the surrounding /sales page already carries its own KPIs).
 *
 * Dismissals are local-only (Set in state), matching the Dashboard pattern.
 * Reset on a fresh fetch (projectId change).
 */

const ATTRIBUTION_RULE_SET = new Set<string>(ATTRIBUTION_RULE_IDS);

export default function SalesDecisionPanel({
  projectId,
}: {
  projectId: string | null;
}) {
  const { data, loading, error } = useDecisions(projectId);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const issues = data?.decisions.issues ?? [];
    return issues.filter(
      (i) => ATTRIBUTION_RULE_SET.has(i.ruleId) && !dismissed.has(i.id)
    );
  }, [data, dismissed]);

  const explanations = data?.explanation.issueExplanations ?? {};

  return (
    <section className="rounded-2xl border border-[#1B2238] bg-[#0B1020] overflow-hidden">
      <Header />

      {!projectId && (
        <p className="px-6 py-10 text-center text-sm text-zinc-500">
          Виберіть проєкт, щоб побачити діагностику атрибуції.
        </p>
      )}

      {projectId && loading && (
        <div className="px-6 py-10 flex flex-col items-center gap-3 text-zinc-500">
          <Spinner />
          <p className="text-sm">Аналізуємо атрибуцію…</p>
        </div>
      )}

      {projectId && !loading && error && (
        <div className="px-6 py-10 text-center text-rose-300 text-sm">
          {error}
        </div>
      )}

      {projectId && !loading && !error && data && (
        <div className="p-6 space-y-4">
          {visible.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">
              Немає сигналів по атрибуції за поточний місяць.
            </p>
          ) : (
            visible.map((issue) => {
              // Issues are recomputed fresh per request; explanations come
              // from cache. A fresh issue id can land here before the cron
              // warms its narrative — fall back to the deterministic
              // builder so the rule's signal is never silently dropped.
              const narrative =
                explanations[issue.id] ?? fallbackNarrative(issue);
              return (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  narrative={narrative}
                  onDismiss={(id) =>
                    setDismissed((prev) => {
                      const next = new Set(prev);
                      next.add(id);
                      return next;
                    })
                  }
                />
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="px-6 py-5 border-b border-[#1B2238] flex flex-wrap items-center gap-3">
      <h2 className="text-base font-semibold">Ad Decision Engine</h2>
      <span className="text-sm text-zinc-400">— Attribution Diagnosis</span>
      <span className="text-[10px] uppercase bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 text-violet-300 px-2 py-0.5 rounded font-semibold">
        Beta
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin"
      aria-hidden="true"
    />
  );
}
