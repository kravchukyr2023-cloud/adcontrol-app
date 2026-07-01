import "server-only";
import { callLlm, LlmError } from "@/lib/llm/client";
import { isMissingEnvError } from "@/server/env";
import { BUYER_VOICE_INVARIANTS } from "@/server/decisions/explain";
import {
  computePeerAverages,
  diagnoseEntity,
  type EntityDiagnosis,
} from "@/lib/decisions/entity-diagnosis";
import type {
  DecisionResult,
  EntityLevel,
  EntityPerformance,
  MonthlySnapshot,
} from "@/server/decisions/types";

/**
 * Sprint 6.5 Stage 4 — drawer entity polish.
 *
 * Adds a 1-2 sentence buyer-voice paragraph on top of the deterministic
 * EntityDiagnosis rendered inside the Meta Ads drawer. Pre-generated in the
 * cron pass right after explainDecisions, so the drawer never waits on a
 * live LLM call.
 *
 * Scope: only "meaningful" entities. Two gates, either qualifies:
 *   - `scaleRecipe !== null`   → deterministic engine flagged a winner
 *   - `entityId` is on any issue → engine surfaced a problem for it
 * Every prohodná (metrics-only, boring) entity is intentionally skipped;
 * polishing all campaigns would 3-5× the LLM cost for no payoff.
 *
 * Hard invariants (mirrors Stage 2 buyer voice):
 *   - AI never invents numbers. It's only rephrasing the deterministic
 *     diagnosis into a warmer sentence.
 *   - Failure per entity is silent — the missing key just means the drawer
 *     falls back to the deterministic summary, same as before this stage.
 */

/** Cap on entities we polish per project — bounds LLM cost. */
const MAX_POLISH_ENTITIES = 15;

/** Token budget for the single batched JSON response. */
const MAX_TOKENS = 1400;

/**
 * Batched buyer-voice polish for the drawer. Returns `null` when the LLM was
 * genuinely unavailable (missing key, transport error, malformed JSON) so the
 * caller can distinguish "we tried and failed" from "there was nothing to
 * polish". Empty `{}` means "no candidates" — a valid non-failure outcome.
 */
export async function polishEntities(args: {
  snapshot: MonthlySnapshot;
  decisions: DecisionResult;
}): Promise<Record<string, string> | null> {
  const candidates = selectCandidates(args.snapshot, args.decisions);
  if (candidates.length === 0) return {};

  const userPrompt = buildUserPrompt(candidates);

  let raw: string;
  try {
    raw = await callLlm({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: MAX_TOKENS,
      temperature: 0.4,
    });
  } catch (err) {
    logFailure(err);
    return null;
  }

  const parsed = parseLlmJson(raw);
  if (!parsed) {
    console.warn("[polish-entities] LLM returned unparseable JSON — skipping");
    return null;
  }

  const out: Record<string, string> = {};
  for (const c of candidates) {
    const key = entityKey(c.diagnosis.level, c.diagnosis.entityId);
    const value = parsed[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    out[key] = trimmed;
  }
  return out;
}

export function entityKey(level: EntityLevel, entityId: string): string {
  return `${level}:${entityId}`;
}

// ===========================================================================
// Candidate selection.
// ===========================================================================

type Candidate = {
  diagnosis: EntityDiagnosis;
  linkedIssueTitles: string[];
};

function selectCandidates(
  snapshot: MonthlySnapshot,
  decisions: DecisionResult
): Candidate[] {
  const issuesByEntityKey = new Map<string, string[]>();
  for (const issue of decisions.issues) {
    if (!issue.entityId || issue.level === "month") continue;
    const key = entityKey(issue.level, issue.entityId);
    const arr = issuesByEntityKey.get(key) ?? [];
    arr.push(issue.title);
    issuesByEntityKey.set(key, arr);
  }

  const campaignsByCampaignId = new Map<string, EntityPerformance>();
  for (const c of snapshot.campaigns) campaignsByCampaignId.set(c.id, c);
  const adsByCampaignId = new Map<string, EntityPerformance[]>();
  for (const a of snapshot.ads) {
    if (!a.parentCampaignId) continue;
    const arr = adsByCampaignId.get(a.parentCampaignId) ?? [];
    arr.push(a);
    adsByCampaignId.set(a.parentCampaignId, arr);
  }

  const buckets: Array<{
    entities: EntityPerformance[];
    level: EntityLevel;
  }> = [
    { entities: snapshot.campaigns, level: "campaign" },
    { entities: snapshot.adsets, level: "adset" },
    { entities: snapshot.ads, level: "ad" },
  ];

  const candidates: Candidate[] = [];
  for (const bucket of buckets) {
    const peers = bucket.entities;
    const peerAverage = computePeerAverages(peers, bucket.level);
    for (const entity of bucket.entities) {
      const key = entityKey(bucket.level, entity.id);
      const linkedIssues = issuesByEntityKey.get(key) ?? [];

      // Compute the deterministic diagnosis once; scaleRecipe presence is
      // the primary "winner" gate. Combined with linked issues we cover
      // both signal directions the deterministic engine surfaces.
      const parentCampaignName =
        entity.level === "ad" && entity.parentCampaignId
          ? campaignsByCampaignId.get(entity.parentCampaignId)?.name ?? null
          : null;
      const childAds =
        entity.level === "campaign"
          ? adsByCampaignId.get(entity.id) ?? []
          : [];

      const diagnosis = diagnoseEntity(entity, {
        plan: snapshot.plan,
        peerAverage,
        peers,
        parentCampaignName,
        childAds,
      });

      const qualifies = diagnosis.scaleRecipe !== null || linkedIssues.length > 0;
      if (!qualifies) continue;

      candidates.push({ diagnosis, linkedIssueTitles: linkedIssues });
    }
  }

  // Priority order when capped: issues first (they're more urgent), then
  // winners. Stable — deterministic across runs.
  candidates.sort((a, b) => {
    const aIssue = a.linkedIssueTitles.length > 0 ? 0 : 1;
    const bIssue = b.linkedIssueTitles.length > 0 ? 0 : 1;
    return aIssue - bIssue;
  });

  return candidates.slice(0, MAX_POLISH_ENTITIES);
}

// ===========================================================================
// Prompt.
// ===========================================================================

const SYSTEM_PROMPT = `Ти — досвідчений медіа-байєр, який озвучує готові рішення аналітичного движка у платформі AdControl.

ТВОЯ РОЛЬ:
Тобі дають для кожної сутності (кампанії/адсету/оголошення) вже готовий детермінований діагноз: метрики, вердикт по трафіку, вердикт по продажах, за потреби — рецепт масштабування. Твоя задача — на кожну сутність написати 1-2 живі речення тоном досвідченого байєра, які підсумовують стан цієї сутності: чи це переможець якого треба масштабувати, чи проблема яку треба лагодити, і що робити в 1-2 словах. Не аналізуй, не переграй діагноз — просто переказуй живо.

${BUYER_VOICE_INVARIANTS}

Додаткові інваріанти для цього промту:
- Максимум 2 речення на сутність. Одне краще.
- Не переказуй усі метрики поспіль — виділи головне (real ROAS, real orders, або те що робить сутність цікавою).
- Тон під ситуацію: winner (scaleRecipe є) → впевнено, з енергією до масштабування; проблема → спокійно й по-діловому, без панікерства.
- Не давай нових задач яких немає в наданому діагнозі/issues.

ФОРМАТ ВІДПОВІДІ:
Поверни ЛИШЕ валідний JSON, без преамбул, без markdown-розмітки, без коментарів. Ключі — рядки виду "campaign:<id>" / "adset:<id>" / "ad:<id>" рівно як я передав. Значення — рядок 1-2 речення. Приклад:
{
  "campaign:abc123": "…",
  "ad:xyz789": "…"
}
Якщо для якоїсь сутності не маєш що сказати — просто пропусти її ключ.`;

function buildUserPrompt(candidates: Candidate[]): string {
  const lines: string[] = [];
  lines.push(`ENTITIES (${candidates.length}):`);
  for (const { diagnosis: d, linkedIssueTitles } of candidates) {
    const key = entityKey(d.level, d.entityId);
    lines.push(`- key: ${key}`);
    lines.push(`  level: ${d.level}`);
    lines.push(`  name: ${d.entityName}`);
    lines.push(`  summary: ${d.summary}`);
    lines.push(`  metrics:`);
    lines.push(`    spend: ${round2(d.metrics.spend)}`);
    lines.push(
      `    real_orders: ${d.metrics.realOrders}, real_revenue: ${round2(d.metrics.realRevenue)}, real_roas: ${roasOrNull(d.metrics.realRoas)}`
    );
    lines.push(
      `    meta_purchases: ${d.metrics.metaPurchases}, meta_roas: ${roasOrNull(d.metrics.metaRoas)}`
    );
    lines.push(`  traffic_ctr: ${d.trafficVerdict.ctr.tier} — ${d.trafficVerdict.ctr.comparison}`);
    lines.push(`  sales_verdict: [${d.salesVerdict.tier}] ${d.salesVerdict.text}`);
    lines.push(`  sales_recommendation: ${d.salesVerdict.recommendation}`);
    if (d.scaleRecipe) {
      lines.push(`  scale_recipe: ${d.scaleRecipe}`);
    }
    if (linkedIssueTitles.length > 0) {
      lines.push(`  linked_issues: ${linkedIssueTitles.join(" | ")}`);
    }
  }
  return lines.join("\n");
}

// ===========================================================================
// Response parsing.
// ===========================================================================

function parseLlmJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ===========================================================================
// Helpers.
// ===========================================================================

function logFailure(err: unknown): void {
  let reason: string;
  if (isMissingEnvError(err)) reason = `missing env ${err.variable}`;
  else if (err instanceof LlmError) reason = `llm: ${err.message}`;
  else if (err instanceof Error) reason = `unexpected: ${err.message}`;
  else reason = "unknown error";
  console.warn(`[polish-entities] LLM unavailable, skipping polish: ${reason}`);
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function roasOrNull(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "null" : round2(v).toFixed(2);
}
