// Client-safe helpers for Sprint 6.5 Stage 5 — "confidence context".
//
// Two tiny deterministic string builders the drawer / cards render below the
// main narrative. Deliberately UI-side (no `server-only`, no fetches, no
// LLM): the numbers already live in `issue.facts` / `attribution.coverage`
// and we don't need the AI layer to surface them — same lesson as
// Sprint 6.5 Stage 3 fix (weak models silently drop structural
// instructions, so we build structure in code).
//
//   - buildRationale(issue)        → "Підстава: витрати 31.5, 0 real-продажів, частка бюджету 69%"
//   - buildConfidenceNote(attr)    → "трекінг покриває 2% — real-числа неточні"
//
// Both are pure and null-safe: sparse facts → shorter line, missing
// attribution → null. Callers render the results as plain text; there's
// no JSX here.

import type {
  AttributionHealth,
  DecisionIssue,
  IssueFact,
} from "@/server/decisions/types";

// ===========================================================================
// buildRationale — "Чому так раджу" one-liner from the top 3 informative facts.
// ===========================================================================

/**
 * Compact Ukrainian rationale line built from up to 3 of the issue's
 * numeric facts. Order preserved from the rules engine (rule authors put
 * the load-bearing signals first). Facts that are pure context noise
 * (Effective status, Impressions) are skipped so we don't waste one of
 * the three slots. Returns an empty string when the issue has no usable
 * facts — callers should guard on `.length === 0` and skip rendering.
 */
export function buildRationale(issue: DecisionIssue): string {
  const parts: string[] = [];
  for (const fact of issue.facts) {
    if (parts.length >= 3) break;
    if (!isInformative(fact)) continue;
    const rendered = renderFact(fact);
    if (rendered !== null) parts.push(rendered);
  }
  if (parts.length === 0) return "";
  return `Підстава: ${parts.join(", ")}`;
}

function isInformative(fact: IssueFact): boolean {
  if (fact.value === null) return false;
  if (typeof fact.value === "string" && fact.value.trim().length === 0) {
    return false;
  }
  // Noise skiplist — status strings and impression counts don't move the
  // decision, they just take up space in a 3-fact line.
  const label = fact.label.toLowerCase();
  if (label.includes("effective status")) return false;
  if (label === "impressions") return false;
  return true;
}

function renderFact(fact: IssueFact): string | null {
  const short = shortLabelUa(fact.label);
  const value = formatValue(fact);
  if (value === null) return null;
  // Some labels are more natural as "<value> <label>" (напр. "0 real-продажів"),
  // others as "<label> <value>" ("частка бюджету 69%"). We use a per-label
  // flag inside the dictionary to choose.
  return short.valueFirst ? `${value} ${short.text}` : `${short.text} ${value}`;
}

// ===========================================================================
// Fact → short Ukrainian label dictionary.
//
// Covers every label the current rules engine emits (M0/M1/M2/C1/C2/A1/AD1
// helpers in rules.ts). Unknown labels fall through to the raw English text
// so a new rule never surfaces an empty string — worst case it looks like
// "Some New Label 123", which is still readable.
// ===========================================================================

type ShortLabel = { text: string; valueFirst: boolean };

const LABEL_MAP: Record<string, ShortLabel> = {
  "spend mtd": { text: "витрати", valueFirst: false },
  "spend": { text: "витрати", valueFirst: false },
  "share of total spend": { text: "частка бюджету", valueFirst: false },
  "real orders": { text: "real-продажів", valueFirst: true },
  "real orders mtd": { text: "real-продажів", valueFirst: true },
  "real revenue": { text: "real-виторг", valueFirst: false },
  "real revenue mtd": { text: "real-виторг", valueFirst: false },
  "real roas": { text: "real ROAS", valueFirst: false },
  "meta roas": { text: "Meta ROAS", valueFirst: false },
  "target roas": { text: "ціль ROAS", valueFirst: false },
  "meta revenue": { text: "Meta-виторг", valueFirst: false },
  "meta-reported revenue": { text: "Meta-виторг", valueFirst: false },
  "meta-reported purchases mtd": { text: "Meta-продажів", valueFirst: true },
  "confirmed share of meta purchases": { text: "трекінг Meta", valueFirst: false },
  "unconfirmed meta purchases": { text: "непідтверджених Meta", valueFirst: true },
  "pro-rated target mtd": { text: "план на сьогодні", valueFirst: false },
  "monthly target": { text: "план місяця", valueFirst: false },
  "% of pro-rated target": { text: "% плану", valueFirst: false },
  "days left in month": { text: "днів до кінця місяця", valueFirst: true },
  "daily revenue needed to hit plan": { text: "потрібно/день", valueFirst: false },
  "adset real roas": { text: "real ROAS адсета", valueFirst: false },
  "campaign average real roas": { text: "середній ROAS кампанії", valueFirst: false },
  "adsets compared": { text: "адсетів порівняно", valueFirst: true },
};

function shortLabelUa(label: string): ShortLabel {
  const key = label.trim().toLowerCase();
  return LABEL_MAP[key] ?? { text: label, valueFirst: false };
}

// ===========================================================================
// Value formatting — treat share/% labels as percentages, ROAS as ×N.NN, the
// rest as plain rounded numbers. Strings pass through untouched.
// ===========================================================================

function formatValue(fact: IssueFact): string | null {
  if (fact.value === null) return null;
  if (typeof fact.value === "string") {
    const trimmed = fact.value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  const label = fact.label.toLowerCase();
  const n = fact.value;
  if (!Number.isFinite(n)) return null;

  // "Confirmed share of Meta purchases" / "Share of total spend" → 0..1 → percent.
  if (label.includes("share")) {
    return `${Math.round(n * 100)}%`;
  }
  // "% of pro-rated target" — value is already an integer percentage (rules
  // pre-multiplied to keep the AI honest, see rules.ts M1 comment).
  if (label.startsWith("%")) {
    return `${Math.round(n)}%`;
  }
  if (label.includes("roas")) {
    return `×${round2(n).toFixed(2)}`;
  }
  // Integer counts stay integer, everything else keeps 2 decimals — matches
  // the drawer's Metrics grid.
  if (isIntegerCountLabel(label)) {
    return `${Math.round(n)}`;
  }
  return `${round2(n)}`;
}

function isIntegerCountLabel(label: string): boolean {
  return (
    label.includes("orders") ||
    label.includes("purchases") ||
    label.includes("days") ||
    label.includes("compared")
  );
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ===========================================================================
// buildConfidenceNote — one-line "why is this orientation-only" tag.
// ===========================================================================

/**
 * Ukrainian confidence caveat rendered next to the "орієнтовно" pill on
 * downgraded issues. Returns null when attribution is reliable so callers
 * can conditionally omit the note without a wrapper.
 */
export function buildConfidenceNote(
  attribution: AttributionHealth | undefined | null
): string | null {
  if (!attribution) return null;
  if (attribution.reliable) return null;
  const coverage = Math.max(0, Math.min(1, attribution.coverage));
  const pctStr = `${Math.round(coverage * 100)}%`;
  return `трекінг покриває ${pctStr} — real-числа неточні`;
}
