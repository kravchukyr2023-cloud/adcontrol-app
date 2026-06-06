import type { ProjectSummary } from "@/hooks/use-project-summaries";
import {
  computeProRatedTarget,
  computeProgressPercent,
  progressColor,
  type MetricType,
} from "@/lib/project-progress";

type Props = {
  id: string;
  name: string;
  currency: string;
  monthlyRevenueGoal: number;
  monthlyAdBudget: number;
  targetRoas: number;
  locked?: boolean;
  /** This month's actual totals; `null` while the summaries call is in flight. */
  summary?: ProjectSummary | null;
  onOpen: (id: string) => void;
  onLockedClick?: () => void;
};

function buildInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");

  return parts.join("") || "P";
}

function fmt(currency: string, value: number): string {
  if (!value) return `${currency} —`;
  if (value >= 1000) {
    return `${currency} ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  return `${currency} ${value.toLocaleString()}`;
}

/** Format an "actual" value. 0 still renders as "currency 0" (not "—"). */
function fmtActual(currency: string, value: number): string {
  if (value >= 1000) {
    return `${currency} ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  // round to int for compactness in the small card layout
  return `${currency} ${Math.round(value).toLocaleString()}`;
}

export default function ProjectCard({
  id,
  name,
  currency,
  monthlyRevenueGoal,
  monthlyAdBudget,
  targetRoas,
  locked,
  summary,
  onOpen,
  onLockedClick,
}: Props) {
  const initials = buildInitials(name);

  function handleClick() {
    if (locked) {
      onLockedClick?.();
    } else {
      onOpen(id);
    }
  }

  const isConnected = !locked && summary?.hasActiveMetaConnection === true;

  return (
    <div
      className={
        locked
          ? "group bg-[#0B1020] border border-rose-500/30 rounded-3xl p-6 flex flex-col opacity-70"
          : "group bg-[#0B1020] border border-[#1B2238] rounded-3xl p-6 flex flex-col hover:border-[#6D5EF8]/60 transition"
      }
    >

      <div className="flex items-start justify-between mb-6">
        <div
          className={
            locked
              ? "w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500 font-semibold"
              : "w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white font-semibold"
          }
        >
          {initials}
        </div>

        {locked ? (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-300 border border-rose-500/40 bg-rose-500/10 px-2 py-1 rounded-full">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Paused
          </span>
        ) : isConnected ? (
          <span className="text-[10px] uppercase tracking-wider text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded-full">
            Meta connected
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-[#1B2238] bg-black/30 px-2 py-1 rounded-full">
            Waiting for integrations
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-white mb-1 truncate">
        {name}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Meta Ads · {currency}
      </p>

      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3">
        Monthly targets
      </p>
      <div className="grid grid-cols-1 gap-3 mb-6">
        <MetricRow
          label="Revenue"
          metric="revenue"
          currency={currency}
          target={monthlyRevenueGoal}
          actual={summary?.actualRevenue ?? null}
          loaded={summary !== undefined && summary !== null}
        />
        <MetricRow
          label="Spend"
          metric="spend"
          currency={currency}
          target={monthlyAdBudget}
          actual={summary?.actualSpend ?? null}
          loaded={summary !== undefined && summary !== null}
        />
        <MetricRow
          label="ROAS"
          metric="roas"
          currency={null}
          target={targetRoas}
          actual={summary?.actualRoas ?? null}
          loaded={summary !== undefined && summary !== null}
          isRoas
        />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-6">
        <span
          className={
            isConnected
              ? "w-1.5 h-1.5 rounded-full bg-emerald-500"
              : "w-1.5 h-1.5 rounded-full bg-zinc-600"
          }
        />
        {locked
          ? "Paused — payment required"
          : isConnected
          ? "Meta connected · Data updated daily"
          : "Meta not connected · No synced data"}
      </div>

      <button
        onClick={handleClick}
        className={
          locked
            ? "mt-auto text-sm font-medium text-rose-300 hover:text-white text-left transition"
            : "mt-auto text-sm font-medium text-[#a99cff] hover:text-white text-left transition"
        }
      >
        {locked ? "Restore access →" : "Open Project →"}
      </button>
    </div>
  );
}

type MetricRowProps = {
  label: string;
  metric: MetricType;
  /** Currency code, or `null` for ROAS (unit is "x"). */
  currency: string | null;
  /** Monthly target. `0` ⇒ no plan-vs-actual UI; show actual only. */
  target: number;
  /** Actual value for this month. `null` ⇒ summaries still loading. */
  actual: number | null;
  loaded: boolean;
  isRoas?: boolean;
};

function MetricRow({
  label,
  metric,
  currency,
  target,
  actual,
  loaded,
  isRoas,
}: MetricRowProps) {
  const hasTarget = target > 0;
  const renderActual = (v: number): string => {
    if (isRoas) return `${v.toFixed(1)}x`;
    if (currency) return fmtActual(currency, v);
    return v.toLocaleString();
  };
  const renderTarget = (v: number): string => {
    if (isRoas) return `${v.toFixed(1)}x`;
    if (currency) return fmt(currency, v);
    return v.toLocaleString();
  };

  // --- not-yet-loaded skeleton ---
  if (!loaded) {
    return (
      <div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          <span>{label}</span>
        </div>
        <p className="text-sm font-semibold text-white truncate">
          — {hasTarget ? `/ ${renderTarget(target)}` : ""}
        </p>
        {hasTarget && (
          <div className="mt-1.5 h-1 rounded-full bg-[#1B2238] overflow-hidden">
            <div className="h-full bg-[#1B2238]" />
          </div>
        )}
      </div>
    );
  }

  const actualValue = actual ?? 0;

  // --- no target → actual-only display ---
  if (!hasTarget) {
    return (
      <div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          <span>{label}</span>
        </div>
        <p className="text-sm font-semibold text-white truncate">
          {renderActual(actualValue)}
        </p>
      </div>
    );
  }

  // --- target set → plan vs actual with pro-rated bar ---
  const proRatedTarget = computeProRatedTarget(target);
  const percent = computeProgressPercent(actualValue, proRatedTarget);
  const clampedWidth = Math.max(0, Math.min(percent, 100));
  const barColor = progressColor(percent, metric);

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
        <span>{label}</span>
        <span className="text-zinc-400 normal-case tracking-normal">
          {Math.round(percent)}%
        </span>
      </div>
      <p className="text-sm font-semibold text-white truncate">
        {renderActual(actualValue)}{" "}
        <span className="text-zinc-500 font-normal">
          / {renderTarget(target)}
        </span>
      </p>
      <div className="mt-1.5 h-1 rounded-full bg-[#1B2238] overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${clampedWidth}%` }}
        />
      </div>
    </div>
  );
}
