"use client";

import type {
  AttributionHealth,
  DecisionIssue,
  IssueNarrative,
} from "@/server/decisions/types";
import {
  buildConfidenceNote,
  buildRationale,
} from "@/lib/decisions/confidence-context";

/**
 * Stage 33b — pure, reusable Issue card. The Dashboard / Sales / project
 * cards (33c-33d) all render this component; it never fetches data or
 * decides what's visible. Pass an `issue` + its `narrative` and you're done.
 *
 * Visuals follow the Stage 33 design reference:
 *   - severity badge (critical / warning / opportunity / info)
 *   - optional "орієнтовно" pill when confidence === 'low'
 *   - 4-section grid: IMPACT / DIAGNOSIS / ACTION / EXPECTED RESULT
 *   - Accept task (no-op for now) + Dismiss (callback)
 */

type Severity = DecisionIssue["severity"];

const severityBadge: Record<Severity, string> = {
  critical: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  warning: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  opportunity: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  info: "text-zinc-300 border-zinc-500/30 bg-zinc-500/10",
};

const severityBar: Record<Severity, string> = {
  critical: "bg-rose-500/70",
  warning: "bg-amber-500/70",
  opportunity: "bg-emerald-500/70",
  info: "bg-zinc-500/70",
};

const severityLabel: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  opportunity: "Opportunity",
  info: "Info",
};

export default function IssueCard({
  issue,
  narrative,
  attribution,
  onDismiss,
}: {
  issue: DecisionIssue;
  narrative: IssueNarrative;
  /**
   * Optional — when provided, powers the confidence-note tag next to the
   * "орієнтовно" pill (Sprint 6.5 Stage 5). Absent = pill renders without
   * the caveat, matching pre-Stage-5 behaviour.
   */
  attribution?: AttributionHealth | null;
  onDismiss?: (id: string) => void;
}) {
  const rationale = buildRationale(issue);
  const confidenceNote =
    issue.confidence === "low" ? buildConfidenceNote(attribution) : null;
  return (
    <article className="relative border border-[#1B2238] rounded-xl bg-black/30 overflow-hidden">
      {/* Left severity rail — quick scan colour without dominating the layout. */}
      <span
        aria-hidden
        className={`absolute top-0 left-0 bottom-0 w-1 ${severityBar[issue.severity]}`}
      />

      <div className="p-5 pl-6">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <span
            className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded shrink-0 self-start ${severityBadge[issue.severity]}`}
          >
            {severityLabel[issue.severity]}
          </span>

          {issue.confidence === "low" && (
            <span
              title={
                confidenceNote
                  ? `Розрахунок спирається на неповний трекінг — це орієнтир. ${confidenceNote}.`
                  : "Розрахунок спирається на неповний трекінг — це орієнтир."
              }
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider border px-2 py-1 rounded shrink-0 self-start border-zinc-700/60 bg-zinc-700/20 text-zinc-300"
            >
              <span>орієнтовно</span>
              {confidenceNote && (
                <>
                  <span aria-hidden className="text-zinc-500">
                    ·
                  </span>
                  <span className="normal-case tracking-normal text-zinc-400 font-normal">
                    {confidenceNote}
                  </span>
                </>
              )}
            </span>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold leading-snug">
              {issue.title}
            </h3>
            {(issue.entityName || issue.parentContext) && (
              <p className="text-xs text-zinc-500 mt-1">
                {issue.entityName ?? ""}
                {issue.entityName && issue.parentContext ? " · " : ""}
                {issue.parentContext ?? ""}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4 mb-4 text-sm">
              <Section label="Impact" body={narrative.impact} />
              <Section label="Diagnosis" body={narrative.diagnosis} />
              <Section label="Action" body={narrative.action} />
              <Section label="Expected result" body={narrative.expectedResult} />
            </div>

            {rationale && (
              <p className="text-[11px] text-zinc-500 leading-snug mb-4">
                {rationale}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // Accept task is intentionally a no-op for now —
                  // Stage 33b is read-only. Wiring lands when we add
                  // task persistence (post-Sprint 6).
                  console.info(`[issue-card] accept task: ${issue.id}`);
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 transition"
              >
                Accept task
              </button>
              <button
                type="button"
                onClick={() => onDismiss?.(issue.id)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
        {label}
      </p>
      <p className="text-zinc-300 leading-relaxed">{body}</p>
    </div>
  );
}
