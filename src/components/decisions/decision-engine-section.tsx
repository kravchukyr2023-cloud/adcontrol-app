"use client";

import { useMemo, useState } from "react";
import { useDecisions } from "@/hooks/use-decisions";
import type { IssueNarrative } from "@/server/decisions/types";
import IssueCard from "@/components/decisions/issue-card";
import { fallbackNarrative } from "@/lib/decisions/fallback-narrative";
import DecisionOnboarding, {
  computeOnboardingSteps,
} from "@/components/decisions/decision-onboarding";

/**
 * Stage 33b — Dashboard surface of the Decision Engine.
 *
 * Composition:
 *   1. AI monthly plan banner + Refresh button (busts the LLM cache).
 *   2. Pro-rated revenue progress bar with attribution-health caveat.
 *   3. Tabs — Revenue Leaks / Growth Opportunities / Priority Actions.
 *   4. List of IssueCard for the active tab.
 *
 * Dismissals are local-only (Set in state); they reset on refetch. No DB
 * persistence — explicit product decision.
 *
 * M0 (attribution health) is kept inside Revenue Leaks rather than promoted
 * to its own banner — the evaluator already pins it to the top, and giving
 * it the same card shape keeps the surface predictable. The pro-rated
 * progress block carries its own short caveat when attribution is unreliable.
 */

type TabKey = "leaks" | "opportunities" | "priority";

const TAB_LABEL: Record<TabKey, string> = {
  leaks: "Revenue Leaks",
  opportunities: "Growth Opportunities",
  priority: "Priority Actions",
};

export default function DecisionEngineSection({
  projectId,
}: {
  projectId: string | null;
}) {
  const { data, loading, error, refetch, refreshing } = useDecisions(projectId);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>("leaks");

  const explanations = data?.explanation.issueExplanations ?? {};

  // Partition once; tabs each pick the slice they care about. Source the
  // issues array from `data` directly inside useMemo so the dependency is
  // stable across renders that don't actually have new data.
  const partitioned = useMemo(() => {
    const issues = data?.decisions.issues ?? [];
    const visible = issues.filter((i) => !dismissed.has(i.id));
    return {
      leaks: visible.filter(
        (i) => i.severity === "critical" || i.severity === "warning"
      ),
      opportunities: visible.filter((i) => i.severity === "opportunity"),
      priority: visible,
    };
  }, [data, dismissed]);

  const counts = {
    leaks: partitioned.leaks.length,
    opportunities: partitioned.opportunities.length,
    priority: partitioned.priority.length,
  };

  const activeList = partitioned[activeTab];

  return (
    <section className="rounded-2xl border border-[#1B2238] bg-[#0B1020] overflow-hidden">
      <Header
        onRefresh={() => {
          // Reset dismissals on manual refresh — the AI may have produced
          // a different issue set, so a stale local Set would silently hide
          // new findings.
          setDismissed(new Set());
          refetch({ refresh: true });
        }}
        refreshing={refreshing}
        canRefresh={!!projectId && !loading}
      />

      {!projectId && <BlockedState message="Select a project to see Decision Engine output." />}

      {projectId && loading && <LoadingState />}

      {projectId && !loading && error && (
        <div className="px-6 py-12 text-center text-rose-300 text-sm">
          {error}
        </div>
      )}

      {projectId && !loading && !error && data && (() => {
        // Stage 34 — branch on snapshot readiness. Branching on a SINGLE
        // shared computation (computeOnboardingSteps) so the section and
        // the onboarding card can't drift: a user who connected Meta but
        // skipped targets and sales still sees onboarding with one ✅ and
        // two ○, instead of slipping into a "waiting" state that hides
        // the remaining steps.
        const { snapshot } = data;
        const onboarding = computeOnboardingSteps(snapshot);
        if (!onboarding.allDone) {
          return <DecisionOnboarding snapshot={snapshot} />;
        }
        // All three steps wired but Meta hasn't reported activity yet.
        if (snapshot.totals.spend === 0) {
          return <WaitingForData />;
        }
        return (
          <FullDecisionView
            data={data}
            activeTab={activeTab}
            counts={counts}
            onChangeTab={setActiveTab}
            activeList={activeList}
            explanations={explanations}
            onDismiss={(id) =>
              setDismissed((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
              })
            }
          />
        );
      })()}
    </section>
  );
}

// ===========================================================================
// "Has data" composition — extracted so the readiness branch above reads
// cleanly. Behaviour identical to the prior inline render.
// ===========================================================================

type FullDecisionViewProps = {
  data: NonNullable<ReturnType<typeof useDecisions>["data"]>;
  activeTab: TabKey;
  counts: Record<TabKey, number>;
  onChangeTab: (k: TabKey) => void;
  activeList: NonNullable<
    ReturnType<typeof useDecisions>["data"]
  >["decisions"]["issues"];
  explanations: Record<string, IssueNarrative>;
  onDismiss: (id: string) => void;
};

function FullDecisionView({
  data,
  activeTab,
  counts,
  onChangeTab,
  activeList,
  explanations,
  onDismiss,
}: FullDecisionViewProps) {
  return (
    <>
      <SummaryBlock data={data} />

      <Tabs activeTab={activeTab} counts={counts} onChange={onChangeTab} />

      <div className="px-6 py-5 space-y-4">
        {activeList.length === 0 ? (
          <EmptyTab tab={activeTab} />
        ) : (
          activeList.map((issue) => {
            // Issues are recomputed fresh per request; explanations come
            // from cache. A fresh issue id can land here before the cron
            // warms its narrative — fall back to the deterministic
            // builder so the rule's signal is never silently dropped.
            const narrative: IssueNarrative =
              explanations[issue.id] ?? fallbackNarrative(issue);
            return (
              <IssueCard
                key={issue.id}
                issue={issue}
                narrative={narrative}
                attribution={data.decisions.attributionHealth}
                onDismiss={onDismiss}
              />
            );
          })
        )}
      </div>
    </>
  );
}

function WaitingForData() {
  return (
    <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
      <span
        className="w-10 h-10 rounded-full border border-[#1B2238] bg-black/30 text-zinc-400 inline-flex items-center justify-center"
        aria-hidden
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
      <p className="text-sm text-zinc-200 font-medium max-w-md">
        Все підключено. Чекаємо перші покази й продажі за поточний місяць.
      </p>
      <p className="text-xs text-zinc-500 max-w-md">
        Аналіз з&apos;явиться автоматично, щойно Meta або сейлз-джерело
        віддасть першу строчку даних.
      </p>
    </div>
  );
}

// ===========================================================================
// Sub-components — kept local so the section reads top-to-bottom.
// ===========================================================================

function Header({
  onRefresh,
  refreshing,
  canRefresh,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  canRefresh: boolean;
}) {
  return (
    <div className="px-6 py-5 border-b border-[#1B2238] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Ad Decision Engine</h2>
        <span className="text-[10px] uppercase bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 text-violet-300 px-2 py-0.5 rounded font-semibold">
          Beta
        </span>
        <p className="hidden md:block text-xs text-zinc-500">
          Аналіз місяця на основі підтверджених продажів.
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={!canRefresh || refreshing}
        className="h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-200 transition disabled:opacity-50 inline-flex items-center gap-2"
      >
        {refreshing ? (
          <>
            <Spinner />
            Оновлюємо…
          </>
        ) : (
          "Оновити"
        )}
      </button>
    </div>
  );
}

function SummaryBlock({
  data,
}: {
  data: NonNullable<ReturnType<typeof useDecisions>["data"]>;
}) {
  const { snapshot, decisions, explanation, meta } = data;
  const { plan, totals, currency } = snapshot;

  const target = plan.proRatedTargetRevenue;
  const ratio = target > 0 ? totals.realRevenue / target : null;
  const ratioPct = ratio !== null ? Math.round(ratio * 100) : null;
  // Clamp the visual fill at 100% so overachievement doesn't blow out the
  // bar — the numeric label still shows the true percentage.
  const fillPct =
    ratioPct === null ? 0 : Math.max(0, Math.min(ratioPct, 100));

  return (
    <div className="px-6 py-5 border-b border-[#1B2238] space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          AI план місяця
          {!explanation.llmUsed && (
            <span
              className="ml-2 text-zinc-500 normal-case tracking-normal"
              title="LLM був недоступний — текст зібрано з фактів."
            >
              (AI offline — fallback)
            </span>
          )}
        </p>
        <p className="text-sm text-zinc-200 leading-relaxed">
          {explanation.monthlyPlan}
        </p>
        <p className="text-[10px] text-zinc-600 mt-2">
          {meta.explanationFromCache
            ? `Cached · ${formatStamp(meta.explanationComputedAt)}`
            : `Generated · ${formatStamp(meta.explanationComputedAt)}`}
        </p>
      </div>

      {target > 0 && (
        <div>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-zinc-400">
              Real revenue MTD vs pro-rated target
            </span>
            <span className="text-zinc-200">
              {formatMoney(currency, totals.realRevenue)} /{" "}
              {formatMoney(currency, target)}
              {ratioPct !== null && (
                <span className="text-zinc-500"> · {ratioPct}%</span>
              )}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#1B2238] overflow-hidden">
            <div
              className={`h-full transition-all ${progressColor(ratioPct ?? 0)}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          {!decisions.attributionHealth.reliable && (
            <p className="text-[11px] text-zinc-500 mt-2">
              Дані real неповні через трекінг — це орієнтир, а не остаточний
              вердикт.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function progressColor(percent: number): string {
  // Reuses the spirit of lib/project-progress.ts's palette so the bar reads
  // the same as the Projects-screen cards.
  if (percent < 70) return "bg-amber-500/70";
  if (percent < 95) return "bg-blue-500/70";
  if (percent < 110) return "bg-emerald-500/70";
  return "bg-violet-500/70";
}

function Tabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: TabKey;
  counts: Record<TabKey, number>;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div className="px-6 py-3 border-b border-[#1B2238] flex flex-wrap items-center gap-1 text-xs">
      {(["leaks", "opportunities", "priority"] as const).map((key) => {
        const isActive = key === activeTab;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={
              isActive
                ? "px-3 py-1.5 rounded-md bg-[#6D5EF8]/15 text-white border border-[#6D5EF8]/40 inline-flex items-center gap-2"
                : "px-3 py-1.5 rounded-md text-zinc-400 hover:text-white border border-transparent inline-flex items-center gap-2 transition"
            }
          >
            {TAB_LABEL[key]}
            <span className="text-[10px] text-zinc-500">{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyTab({ tab }: { tab: TabKey }) {
  const msg: Record<TabKey, string> = {
    leaks: "Жодних критичних чи попереджень. Місяць іде в плановому темпі.",
    opportunities:
      "Поки немає масштабованих оголошень — почекаємо ще даних або підняли поріг.",
    priority: "Issues відсутні або всі відхилені. Спробуй Оновити.",
  };
  return (
    <p className="text-sm text-zinc-500 text-center py-10">{msg[tab]}</p>
  );
}

function LoadingState() {
  return (
    <div className="px-6 py-12 flex flex-col items-center gap-3 text-zinc-500">
      <Spinner />
      <p className="text-sm">Збираємо план місяця…</p>
    </div>
  );
}

function BlockedState({ message }: { message: string }) {
  return (
    <p className="px-6 py-12 text-center text-sm text-zinc-500">{message}</p>
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

function formatMoney(currency: string, value: number): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString()} ${currency}`;
}

function formatStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
