"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDecisions } from "@/hooks/use-decisions";
import IssueCard from "@/components/decisions/issue-card";
import { fallbackNarrative } from "@/lib/decisions/fallback-narrative";
import {
  computePeerAverages,
  diagnoseEntity,
} from "@/lib/decisions/entity-diagnosis";
import EntityDiagnosisCard from "@/components/decisions/entity-diagnosis-card";
import type { EntityPerformance } from "@/server/decisions/types";

/**
 * Stage 33d-1 — Decision Engine drawer for Meta Ads.
 *
 * This file owns three things:
 *   1. The DiagnosisDrawerContext + useDiagnosisDrawer() hook.
 *   2. The DiagnosisDrawerProvider that holds the selected entity and
 *      renders the drawer as a sibling of children.
 *   3. The drawer body itself.
 *
 * Bundling all three keeps the wiring trivial for the consumer: wrap the
 * page in <DiagnosisDrawerProvider projectId={…}>, then call open(entity)
 * from any trigger. No portals — the fixed positioning is enough on the
 * existing Meta Ads layout.
 *
 * Stage 33d-1 scope: campaign-level entities only. The drawer is
 * level-agnostic; adset/ad triggers land in 33d-2 / 33d-3 without changes
 * here beyond extending LEVEL_LABEL.
 */

export type DiagnosisLevel = "campaign" | "adset" | "ad";

export type DiagnosisEntity = {
  id: string;
  name: string;
  level: DiagnosisLevel;
  spend: number | null;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
};

type DiagnosisDrawerContextValue = {
  entity: DiagnosisEntity | null;
  open: (entity: DiagnosisEntity) => void;
  close: () => void;
};

const DiagnosisDrawerContext =
  createContext<DiagnosisDrawerContextValue | null>(null);

export function useDiagnosisDrawer(): DiagnosisDrawerContextValue {
  const ctx = useContext(DiagnosisDrawerContext);
  if (!ctx) {
    throw new Error(
      "useDiagnosisDrawer must be used inside <DiagnosisDrawerProvider>"
    );
  }
  return ctx;
}

export function DiagnosisDrawerProvider({
  projectId,
  children,
}: {
  projectId: string | null;
  children: ReactNode;
}) {
  const [entity, setEntity] = useState<DiagnosisEntity | null>(null);

  const open = useCallback((next: DiagnosisEntity) => setEntity(next), []);
  const close = useCallback(() => setEntity(null), []);

  const value = useMemo<DiagnosisDrawerContextValue>(
    () => ({ entity, open, close }),
    [entity, open, close]
  );

  return (
    <DiagnosisDrawerContext.Provider value={value}>
      {children}
      <Drawer projectId={projectId} entity={entity} onClose={close} />
    </DiagnosisDrawerContext.Provider>
  );
}

// ===========================================================================
// Trigger button — generic, drop into any row that owns a DiagnosisEntity.
// Lives here (not at the call site) because it consumes the context, and
// the context is only available to descendants of DiagnosisDrawerProvider.
// ===========================================================================

export function DiagnosisTriggerButton({
  entity,
  className,
}: {
  entity: DiagnosisEntity;
  className?: string;
}) {
  const { open } = useDiagnosisDrawer();
  return (
    <button
      type="button"
      onClick={(e) => {
        // Stop propagation so the row's expand chevron (and any future
        // row-level click handlers) don't fire alongside the drawer.
        e.stopPropagation();
        open(entity);
      }}
      aria-label={`Open ${LEVEL_LABEL[entity.level]} diagnosis: ${entity.name}`}
      title="Open diagnosis"
      className={
        className ??
        "inline-flex w-7 h-7 items-center justify-center rounded-md border border-[#6D5EF8]/40 bg-[#6D5EF8]/10 text-violet-300 hover:bg-[#6D5EF8]/20 hover:text-white transition"
      }
    >
      {/* Four-pointed sparkle — distinct from the chevron drill-down icon. */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    </button>
  );
}

// ===========================================================================
// Drawer body.
// ===========================================================================

const LEVEL_LABEL: Record<DiagnosisLevel, string> = {
  campaign: "Campaign",
  adset: "Ad Set",
  ad: "Ad",
};

const DIAGNOSIS_LABEL: Record<DiagnosisLevel, string> = {
  campaign: "Campaign Diagnosis",
  adset: "Ad Set Diagnosis",
  ad: "Ad Diagnosis",
};

// Ukrainian dative-case noun + demonstrative pronoun, agreed in gender,
// used inside running prose. LEVEL_LABEL above is the English UI chip —
// fine for badges, wrong for natural-language fall-throughs like the
// empty state copy. Bundling the pronoun into the map avoids hard-coding
// "цій" at the call site, which only agrees with feminine кампанія.
const LEVEL_UA_DATIVE: Record<DiagnosisLevel, string> = {
  campaign: "цій кампанії",
  adset: "цьому адсету",
  ad: "цьому оголошенню",
};

function Drawer({
  projectId,
  entity,
  onClose,
}: {
  projectId: string | null;
  entity: DiagnosisEntity | null;
  onClose: () => void;
}) {
  // Only hit /api/decisions when the drawer is actually open. Passing null
  // parks the hook in an idle state (no fetch).
  const { data, loading, error } = useDecisions(
    entity ? projectId : null
  );

  // Close on Escape while open.
  useEffect(() => {
    if (!entity) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [entity, onClose]);

  // Lock body scroll while open — the underlying Meta Ads table is wide
  // enough that scroll bleed-through is disorienting.
  useEffect(() => {
    if (!entity || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [entity]);

  if (!entity) return null;

  const issues = (data?.decisions.issues ?? []).filter(
    (i) => i.entityId === entity.id && i.level === entity.level
  );
  const explanations = data?.explanation.issueExplanations ?? {};

  // Step 2 — always-on entity diagnosis (deterministic). Pull the matching
  // EntityPerformance from the snapshot and compute peer averages over the
  // same level. If the entity isn't in the snapshot (no MTD insights), we
  // surface a focused "no MTD activity" note instead of grading metrics
  // that don't exist.
  const entityPerf = data ? pickEntity(data, entity.id, entity.level) : null;
  const peers = data ? pickPeers(data, entity.level) : [];
  // Extra context for the deterministic scale-recipe (Sprint 6.5 Stage
  // 1c/2). Ads need their parent campaign's display name; campaigns need
  // their own ads so the recipe can name the best-performing one. Both
  // fields are looked up from the same snapshot the drawer already
  // fetched — no additional roundtrips.
  const parentCampaignName =
    entityPerf && entityPerf.level === "ad" && entityPerf.parentCampaignId && data
      ? data.snapshot.campaigns.find(
          (c) => c.id === entityPerf.parentCampaignId
        )?.name ?? null
      : null;
  const childAds =
    entityPerf && entityPerf.level === "campaign" && data
      ? data.snapshot.ads.filter((a) => a.parentCampaignId === entityPerf.id)
      : [];
  const diagnosis =
    data && entityPerf
      ? diagnoseEntity(entityPerf, {
          plan: data.snapshot.plan,
          peerAverage: computePeerAverages(peers, entity.level),
          peers,
          parentCampaignName,
          childAds,
        })
      : null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label={`${LEVEL_LABEL[entity.level]} diagnosis: ${entity.name}`}
        className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-[95vw] bg-[#0B1020] border-l border-[#1B2238] flex flex-col"
      >
        <EntityHeader entity={entity} onClose={onClose} />
        <DiagnosisHeader level={entity.level} />

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {projectId && loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-zinc-500">
              <Spinner />
              <p className="text-sm">Аналізуємо сутність…</p>
            </div>
          )}

          {projectId && !loading && error && (
            <p className="text-center text-rose-300 text-sm py-6">{error}</p>
          )}

          {/* Rules-engine issues first — these are the highest-priority
              signals the deterministic + AI layers raised at the project
              level for this entity. Each one carries its own narrative;
              fall back to the deterministic narrative on cache misses. */}
          {projectId &&
            !loading &&
            !error &&
            data &&
            issues.map((issue) => {
              const narrative =
                explanations[issue.id] ?? fallbackNarrative(issue);
              return (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  narrative={narrative}
                />
              );
            })}

          {/* Always-on entity diagnosis. Sits below issues so the rule
              signals stay primary, but is never absent for an entity with
              activity — the previous "no signals" empty state is gone.
              Sprint 6.5 Stage 4 — pass optional buyer-voice polish from
              the cache (pre-generated in cron for meaningful entities).
              Absent = drawer keeps the deterministic summary, no visible
              difference vs pre-Stage-4. */}
          {projectId && !loading && !error && data && diagnosis && (
            <EntityDiagnosisCard
              diagnosis={diagnosis}
              polish={
                data.explanation.entityPolish?.[
                  `${entity.level}:${entity.id}`
                ] ?? null
              }
            />
          )}

          {projectId && !loading && !error && data && !entityPerf && (
            <p className="text-sm text-zinc-500 text-center py-10">
              За поточний місяць по {LEVEL_UA_DATIVE[entity.level]} немає
              жодних показів — повний розбір недоступний.
            </p>
          )}
        </div>

        <Footer onClose={onClose} />
      </aside>
    </>
  );
}

// ===========================================================================
// Entity / peer pickers — keep the level → snapshot.{campaigns|adsets|ads}
// dispatch in one place so future level additions touch only this helper.
// ===========================================================================

function pickEntity(
  data: NonNullable<ReturnType<typeof useDecisions>["data"]>,
  entityId: string,
  level: DiagnosisLevel
): EntityPerformance | null {
  const list = pickPeers(data, level);
  return list.find((e) => e.id === entityId) ?? null;
}

function pickPeers(
  data: NonNullable<ReturnType<typeof useDecisions>["data"]>,
  level: DiagnosisLevel
): EntityPerformance[] {
  switch (level) {
    case "campaign":
      return data.snapshot.campaigns;
    case "adset":
      return data.snapshot.adsets;
    case "ad":
      return data.snapshot.ads;
  }
}

function EntityHeader({
  entity,
  onClose,
}: {
  entity: DiagnosisEntity;
  onClose: () => void;
}) {
  return (
    <div className="px-6 py-4 border-b border-[#1B2238] flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          {LEVEL_LABEL[entity.level]}
        </p>
        <h2 className="text-base font-semibold text-white truncate mt-1">
          {entity.name}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-zinc-400">
          <Metric label="Spend" value={formatMoney(entity.spend)} />
          <Metric label="ROAS" value={formatRoas(entity.roas)} />
          <Metric label="CPA" value={formatMoney(entity.cpa)} />
          <Metric label="CTR" value={formatPct(entity.ctr)} />
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрити діагностику"
        className="text-zinc-500 hover:text-white transition w-8 h-8 rounded-md flex items-center justify-center"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function DiagnosisHeader({ level }: { level: DiagnosisLevel }) {
  return (
    <div className="px-6 py-4 border-b border-[#1B2238] flex flex-wrap items-center gap-3">
      <h3 className="text-sm font-semibold">Ad Decision Engine</h3>
      <span className="text-[10px] uppercase bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 text-violet-300 px-2 py-0.5 rounded font-semibold">
        Beta
      </span>
      <span className="text-xs text-zinc-500">— {DIAGNOSIS_LABEL[level]}</span>
    </div>
  );
}

function Footer({ onClose }: { onClose: () => void }) {
  return (
    <div className="px-6 py-4 border-t border-[#1B2238] flex justify-end">
      <button
        type="button"
        onClick={onClose}
        className="h-9 px-4 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-200 transition"
      >
        Закрити
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <span>
      <span className="text-zinc-500">{label}:</span>{" "}
      <span className="text-zinc-200">{value}</span>
    </span>
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

function formatMoney(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(v);
}

function formatPct(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `${v.toFixed(2)}%`;
}

function formatRoas(v: number | null): string | null {
  if (v === null || !Number.isFinite(v) || v === 0) return null;
  return `×${v.toFixed(2)}`;
}
