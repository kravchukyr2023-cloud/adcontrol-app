"use client";

import type {
  EntityDiagnosis,
  MetricVerdict,
  MetricVerdictTier,
  SalesVerdictTier,
} from "@/lib/decisions/entity-diagnosis";

/**
 * Step 2 — entity diagnosis card. Always rendered inside the Meta Ads
 * drawer when the user clicks a campaign/adset/ad. Never says "no signals":
 * deterministic verdict on metrics + sales + summary, even on entities the
 * rules engine wouldn't surface.
 *
 * Pure presentational — takes the diagnosis the lib/decisions module
 * computes and renders it. No business logic here.
 */

export default function EntityDiagnosisCard({
  diagnosis,
  polish,
}: {
  diagnosis: EntityDiagnosis;
  /**
   * Optional buyer-voice polish (Sprint 6.5 Stage 4). When present, replaces
   * the deterministic one-line summary in the card header. The deterministic
   * metrics / verdicts / scale recipe stay verbatim — polish just softens
   * the top-line prose.
   */
  polish?: string | null;
}) {
  const { metrics, trafficVerdict, salesVerdict, summary, scaleRecipe } =
    diagnosis;
  const headerText = polish?.trim() || summary;

  return (
    <article className="border border-[#1B2238] rounded-xl bg-black/30 overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1B2238] flex items-start gap-3">
        <span className="inline-flex items-center text-[10px] uppercase tracking-wider border px-2 py-1 rounded shrink-0 border-[#6D5EF8]/40 bg-[#6D5EF8]/10 text-violet-300">
          Діагноз
        </span>
        <p className="text-sm text-zinc-200 leading-snug whitespace-pre-line">
          {headerText}
        </p>
      </div>

      <div className="px-5 py-4 space-y-5">
        <MetricsGrid metrics={metrics} />
        <TrafficSection verdict={trafficVerdict} />
        <SalesSection verdict={salesVerdict} />
        {scaleRecipe && <ScaleRecipeSection recipe={scaleRecipe} />}
      </div>
    </article>
  );
}

// ===========================================================================
// Metrics grid — compact 3×3 readout above the verdict blocks.
// ===========================================================================

function MetricsGrid({ metrics }: { metrics: EntityDiagnosis["metrics"] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
        Метрики місяця
      </p>
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        <Cell label="Spend" value={formatMoney(metrics.spend)} />
        <Cell label="Impressions" value={formatInt(metrics.impressions)} />
        <Cell label="Clicks" value={formatInt(metrics.clicks)} />
        <Cell label="CTR" value={formatPct(metrics.ctr)} />
        <Cell label="CPM" value={formatMoney(metrics.cpm)} />
        <Cell label="CPC" value={formatMoney(metrics.cpc)} />
        <Cell label="Meta purchases" value={formatInt(metrics.metaPurchases)} />
        <Cell label="Real orders" value={formatInt(metrics.realOrders)} />
        <Cell label="Real ROAS" value={formatRoas(metrics.realRoas)} />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="text-sm text-zinc-100 mt-0.5 font-medium">{value}</p>
    </div>
  );
}

// ===========================================================================
// Traffic verdict — three rows (CTR / CPC / CPM).
// ===========================================================================

function TrafficSection({
  verdict,
}: {
  verdict: EntityDiagnosis["trafficVerdict"];
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
        Вердикт по трафіку
      </p>
      <div className="space-y-2">
        <TrafficRow item={verdict.ctr} format={formatPct} />
        <TrafficRow item={verdict.cpc} format={formatMoney} />
        <TrafficRow item={verdict.cpm} format={formatMoney} />
      </div>
    </div>
  );
}

function TrafficRow({
  item,
  format,
}: {
  item: MetricVerdict;
  format: (v: number | null) => string;
}) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="text-zinc-500 text-xs w-12 shrink-0">{item.label}</span>
      <span className="text-zinc-100 font-medium w-20 shrink-0">
        {format(item.value)}
      </span>
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded shrink-0 ${metricTierStyle(item.tier)}`}
      >
        {metricTierLabel(item.tier)}
      </span>
      <span className="text-xs text-zinc-400 leading-snug">
        {item.comparison}
      </span>
    </div>
  );
}

// ===========================================================================
// Sales verdict — status badge + text + recommendation.
// ===========================================================================

function SalesSection({
  verdict,
}: {
  verdict: EntityDiagnosis["salesVerdict"];
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
        Вердикт по продажах
      </p>
      <div
        className={`border rounded-lg px-4 py-3 ${salesContainerStyle(verdict.tier)}`}
      >
        <p className="text-sm text-zinc-100 leading-snug">{verdict.text}</p>
        <p className="text-xs text-zinc-400 mt-2 leading-snug">
          <span className="uppercase tracking-wider text-[10px] mr-1 text-zinc-500">
            Рекомендація:
          </span>
          {verdict.recommendation}
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// Scale recipe — deterministic winner-only block. Emerald accent + positive
// framing so it reads distinctly from the neutral verdict rows above.
// ===========================================================================

function ScaleRecipeSection({ recipe }: { recipe: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-2">
        Рецепт масштабування
      </p>
      <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg px-4 py-3">
        <p className="text-sm text-zinc-100 leading-snug">{recipe}</p>
      </div>
    </div>
  );
}

// ===========================================================================
// Styling helpers — keep colour decisions in one place.
// ===========================================================================

function metricTierStyle(tier: MetricVerdictTier): string {
  switch (tier) {
    case "good":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    case "poor":
      return "text-rose-300 border-rose-500/30 bg-rose-500/10";
    case "no_data":
      return "text-zinc-500 border-zinc-700/50 bg-zinc-700/15";
    case "ok":
    default:
      return "text-zinc-300 border-zinc-500/30 bg-zinc-500/10";
  }
}

function metricTierLabel(tier: MetricVerdictTier): string {
  switch (tier) {
    case "good":
      return "Добре";
    case "poor":
      return "Погано";
    case "no_data":
      return "Нема даних";
    case "ok":
    default:
      return "Норма";
  }
}

function salesContainerStyle(tier: SalesVerdictTier): string {
  switch (tier) {
    case "good":
      return "border-emerald-500/30 bg-emerald-500/5";
    case "warning":
      return "border-amber-500/30 bg-amber-500/5";
    case "critical":
      return "border-rose-500/30 bg-rose-500/5";
    case "ok":
    default:
      return "border-[#1B2238] bg-black/20";
  }
}

// ===========================================================================
// Formatters — local, mirror the drawer's existing style.
// ===========================================================================

function formatMoney(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(v);
}

function formatInt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

function formatPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function formatRoas(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v === 0) return "—";
  return `×${v.toFixed(2)}`;
}
