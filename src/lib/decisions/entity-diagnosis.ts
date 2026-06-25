// Client-safe deterministic entity diagnosis.
//
// Step 2 of the drawer rework — given an EntityPerformance from the
// Decision Engine snapshot and the cabinet's peer averages, produces a
// structured diagnosis the drawer renders verbatim. Pure functions, no IO,
// no LLM — the AI polish layer lands as a future step.
//
// Three verdict blocks:
//   - per-metric (CTR / CPC / CPM) vs cabinet-average peers,
//   - sales (real orders → target ROAS; meta-only → tracking warning),
//   - one-sentence summary.

import type {
  EntityLevel,
  EntityPerformance,
  PlanContext,
} from "@/server/decisions/types";

export type MetricVerdictTier = "good" | "ok" | "poor" | "no_data";

export type MetricVerdict = {
  label: string;
  /** Computed metric for this entity (CTR %, CPC, CPM). Null when undefined. */
  value: number | null;
  /** Cabinet-average peer benchmark. Null when no peers have delivery. */
  peerAverage: number | null;
  tier: MetricVerdictTier;
  /** Ukrainian comparison phrase, e.g. "вище середнього на 15%". */
  comparison: string;
};

export type SalesVerdictStatus =
  | "has_real"
  | "meta_only"
  | "no_conversions"
  | "no_activity";

export type SalesVerdictTier = "good" | "ok" | "warning" | "critical";

export type SalesVerdict = {
  status: SalesVerdictStatus;
  tier: SalesVerdictTier;
  text: string;
  recommendation: string;
};

export type EntityDiagnosis = {
  entityId: string;
  entityName: string;
  level: EntityLevel;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpm: number | null;
    cpc: number | null;
    metaPurchases: number;
    metaRoas: number | null;
    realOrders: number;
    realRevenue: number;
    realRoas: number | null;
  };
  trafficVerdict: {
    ctr: MetricVerdict;
    cpc: MetricVerdict;
    cpm: MetricVerdict;
  };
  salesVerdict: SalesVerdict;
  /** One-sentence headline above the card body. */
  summary: string;
};

export type PeerAverages = {
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
};

// ===========================================================================
// Public API.
// ===========================================================================

/**
 * Cabinet-average peers: each entity of `level` with delivery (impressions > 0)
 * contributes one sample. Per-entity averaging (not pooled) so a single big
 * spender can't drag the average and make small entities look "ok".
 */
export function computePeerAverages(
  entities: EntityPerformance[],
  level: EntityLevel
): PeerAverages {
  const peers = entities.filter(
    (e) => e.level === level && e.impressions > 0
  );
  if (peers.length === 0) {
    return { ctr: null, cpm: null, cpc: null };
  }

  let ctrSum = 0;
  let ctrCount = 0;
  let cpmSum = 0;
  let cpmCount = 0;
  let cpcSum = 0;
  let cpcCount = 0;

  for (const p of peers) {
    const ctr = safeDivide(p.clicks, p.impressions);
    if (ctr !== null) {
      ctrSum += ctr;
      ctrCount += 1;
    }
    const cpm =
      p.impressions > 0 ? (p.spend / p.impressions) * 1000 : null;
    if (cpm !== null && Number.isFinite(cpm)) {
      cpmSum += cpm;
      cpmCount += 1;
    }
    const cpc = safeDivide(p.spend, p.clicks);
    if (cpc !== null) {
      cpcSum += cpc;
      cpcCount += 1;
    }
  }

  return {
    ctr: ctrCount > 0 ? ctrSum / ctrCount : null,
    cpm: cpmCount > 0 ? cpmSum / cpmCount : null,
    cpc: cpcCount > 0 ? cpcSum / cpcCount : null,
  };
}

export function diagnoseEntity(
  entity: EntityPerformance,
  context: { plan: PlanContext; peerAverage: PeerAverages }
): EntityDiagnosis {
  const ctr = safeDivide(entity.clicks, entity.impressions);
  const cpc = safeDivide(entity.spend, entity.clicks);
  const cpm =
    entity.impressions > 0
      ? (entity.spend / entity.impressions) * 1000
      : null;

  const trafficVerdict = {
    ctr: verdictMetric({
      label: "CTR",
      value: ctr,
      peer: context.peerAverage.ctr,
      higherIsBetter: true,
      formatter: pct,
    }),
    cpc: verdictMetric({
      label: "CPC",
      value: cpc,
      peer: context.peerAverage.cpc,
      higherIsBetter: false,
      formatter: money,
    }),
    cpm: verdictMetric({
      label: "CPM",
      value: cpm,
      peer: context.peerAverage.cpm,
      higherIsBetter: false,
      formatter: money,
    }),
  };

  const salesVerdict = diagnoseSales(entity, context.plan, trafficVerdict.ctr.tier);

  return {
    entityId: entity.id,
    entityName: entity.name,
    level: entity.level,
    metrics: {
      spend: entity.spend,
      impressions: entity.impressions,
      clicks: entity.clicks,
      ctr,
      cpm,
      cpc,
      metaPurchases: entity.purchases,
      metaRoas: entity.metaRoas,
      realOrders: entity.realOrders,
      realRevenue: entity.realRevenue,
      realRoas: entity.realRoas,
    },
    trafficVerdict,
    salesVerdict,
    summary: buildSummary(salesVerdict),
  };
}

// ===========================================================================
// Internal — metric verdicts.
// ===========================================================================

function verdictMetric(args: {
  label: string;
  value: number | null;
  peer: number | null;
  higherIsBetter: boolean;
  formatter: (v: number) => string;
}): MetricVerdict {
  const { label, value, peer, higherIsBetter, formatter } = args;

  if (value === null || !Number.isFinite(value)) {
    return {
      label,
      value: null,
      peerAverage: peer,
      tier: "no_data",
      comparison: "без активності",
    };
  }
  if (peer === null || peer <= 0) {
    return {
      label,
      value,
      peerAverage: null,
      tier: "ok",
      comparison: "недостатньо даних для порівняння",
    };
  }

  const ratio = value / peer;
  const deltaPct = Math.round((ratio - 1) * 100);
  const absDelta = Math.abs(deltaPct);

  // Tolerance band ±10% around peer average — keeps "ok" honest.
  const BAND = 0.1;

  let tier: MetricVerdictTier;
  if (ratio >= 1 - BAND && ratio <= 1 + BAND) {
    tier = "ok";
  } else if (higherIsBetter) {
    tier = ratio > 1 + BAND ? "good" : "poor";
  } else {
    tier = ratio < 1 - BAND ? "good" : "poor";
  }

  const direction =
    deltaPct === 0
      ? "на рівні середнього"
      : deltaPct > 0
        ? `вище середнього на ${absDelta}%`
        : `нижче середнього на ${absDelta}%`;

  const peerStr = formatter(peer);
  return {
    label,
    value,
    peerAverage: peer,
    tier,
    comparison: `${direction} (середнє ${peerStr})`,
  };
}

// ===========================================================================
// Internal — sales verdict.
// ===========================================================================

function diagnoseSales(
  entity: EntityPerformance,
  plan: PlanContext,
  ctrTier: MetricVerdictTier
): SalesVerdict {
  // 1. No activity at all — `spend === 0` is the only honest "do nothing" path.
  if (entity.spend <= 0 && entity.impressions <= 0) {
    return {
      status: "no_activity",
      tier: "ok",
      text: "Цього місяця без активності — нема spend і нема показів.",
      recommendation:
        "Перевір, чи кампанія взагалі запускалась і чи не в паузі.",
    };
  }

  // 2. Real orders exist — judge by target ROAS.
  if (entity.realOrders > 0 && entity.realRoas !== null) {
    return judgeByRealRoas(entity.realRoas, plan.targetRoas, entity.realOrders);
  }

  // 3. Meta says purchases happen, real DB confirms 0 → tracking warning.
  if (entity.realOrders === 0 && entity.purchases > 0) {
    return {
      status: "meta_only",
      tier: "warning",
      text:
        `Meta показує ${entity.purchases} ${plural(entity.purchases, "покупку", "покупки", "покупок")}, ` +
        `підтверджено реальних 0. ` +
        `Причина — або UTM-трекінг не налаштований, або кампанія дає холості конверсії.`,
      recommendation:
        "Перевір UTM-розмітку оголошень перш ніж робити висновки. Якщо трекінг цілий — сутність під питанням, розглянь паузу або зміну креативу.",
    };
  }

  // 4. No conversions at all (real 0, Meta 0) but spend > 0 — split by CTR.
  if (entity.spend > 0) {
    if (ctrTier === "good" || ctrTier === "ok") {
      return {
        status: "no_conversions",
        tier: "critical",
        text:
          `Витрати ${money(entity.spend)} та ${entity.clicks} кліків — 0 покупок. ` +
          `CTR не нижче середнього, тож трафік йде, але не конвертить.`,
        recommendation:
          "Проблема пост-клік: перевір лендінг, ціну, оффер, швидкість завантаження.",
      };
    }
    return {
      status: "no_conversions",
      tier: "critical",
      text:
        `Витрати ${money(entity.spend)}, але CTR нижче середнього і покупок 0. ` +
        `Трафік слабкий — креатив чи таргет не цікавий аудиторії.`,
      recommendation:
        "Зміни креатив або уточни таргет. Якщо за тиждень нема покращення — пауза.",
    };
  }

  // 5. Defensive default — spend=0 but impressions>0 (paid by daily budget
  // calendar quirk). Treat as no_activity with a softer message.
  return {
    status: "no_activity",
    tier: "ok",
    text: "Сутність майже без активності — витрат немає.",
    recommendation: "Перевір статус і daily budget.",
  };
}

function judgeByRealRoas(
  realRoas: number,
  targetRoas: number,
  realOrders: number
): SalesVerdict {
  // When target_roas is not set, we can still report the absolute value but
  // can't grade it. Don't penalize the user for an unconfigured Settings.
  if (targetRoas <= 0) {
    return {
      status: "has_real",
      tier: "ok",
      text:
        `Real ROAS ×${round2(realRoas)} на ${realOrders} ${plural(realOrders, "замовленні", "замовленнях", "замовленнях")}. ` +
        `Цільовий ROAS у Settings не задано — порівняти нема з чим.`,
      recommendation:
        "Встанови цільовий ROAS у Settings проєкту, щоб отримати конкретну рекомендацію.",
    };
  }

  const ratio = realRoas / targetRoas;
  if (ratio >= 1) {
    return {
      status: "has_real",
      tier: "good",
      text:
        `Real ROAS ×${round2(realRoas)} перевищує цільовий ×${round2(targetRoas)} ` +
        `на ${realOrders} ${plural(realOrders, "замовленні", "замовленнях", "замовленнях")}.`,
      recommendation:
        "Можна масштабувати: підняти денний бюджет або задублювати найкращі адсети.",
    };
  }
  if (ratio >= 0.7) {
    return {
      status: "has_real",
      tier: "ok",
      text:
        `Real ROAS ×${round2(realRoas)} нижче цілі ×${round2(targetRoas)} на ${Math.round(
          (1 - ratio) * 100
        )}%.`,
      recommendation:
        "Тримай і шукай де оптимізувати: найдорожчі адсети, креатив із найгіршим CTR.",
    };
  }
  return {
    status: "has_real",
    tier: "critical",
    text:
      `Real ROAS ×${round2(realRoas)} значно нижче цілі ×${round2(targetRoas)} ` +
      `(${Math.round(ratio * 100)}% від цілі).`,
    recommendation:
      "Перегляньте таргет або креатив. Якщо за 5-7 днів нема зрушень — пауза.",
  };
}

// ===========================================================================
// Internal — summary one-liner.
// ===========================================================================

function buildSummary(sales: SalesVerdict): string {
  switch (sales.status) {
    case "has_real":
      if (sales.tier === "good") return "Масштабуй — real ROAS перевищує ціль.";
      if (sales.tier === "ok") return "Тримай і шукай де оптимізувати.";
      return "Перегляньте таргет/креатив або поставте на паузу.";
    case "meta_only":
      return "Спочатку перевір UTM-трекінг — без нього виводи ненадійні.";
    case "no_conversions":
      return sales.text.includes("трафік слабкий")
        ? "Слабкий трафік — зміни креатив або таргет."
        : "Пост-клік проблема — перевір лендінг та оффер.";
    case "no_activity":
      return "Без активності — перевір статус кампанії.";
  }
}

// ===========================================================================
// Helpers — null-safe arithmetic + formatters.
// ===========================================================================

function safeDivide(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const v = a / b;
  return Number.isFinite(v) ? v : null;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function money(v: number): string {
  return `${round2(v)}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
