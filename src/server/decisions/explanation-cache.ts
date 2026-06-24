import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import type { DecisionExplanation } from "@/server/decisions/types";

/**
 * Stage 32 — DecisionExplanation cache.
 *
 * Cache policy:
 *   - One row per (project_id, month) in `decision_explanations`.
 *   - Month is 'YYYY-MM' UTC, aligned with thisMonthRangeUtc() in the
 *     snapshot builder. A month change naturally invalidates the cache.
 *   - The snapshot + rules layers are recomputed on every request — only
 *     the slow + paid LLM step is cached.
 *
 * Service-role client throughout: callers are responsible for ownership
 * (the /api/decisions route does it; the cron uses snapshot.user_id which
 * comes from a project row it already owns).
 *
 * Partial unique index requires the same select-then-insert-or-update dance
 * as sales_sources — PostgREST's `.upsert(..., onConflict)` cannot target
 * partial unique indexes. The pattern is documented at the call site.
 */

export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, "0");
  const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

export async function getCachedExplanation(args: {
  userId: string;
  projectId: string;
  month: string;
}): Promise<DecisionExplanation | null> {
  const { userId, projectId, month } = args;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("decision_explanations")
    .select("explanation")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    console.warn(
      `[explanation-cache] read failed (${projectId}/${month}): ${error.message}`
    );
    return null;
  }
  if (!data?.explanation) return null;
  return data.explanation as DecisionExplanation;
}

export async function saveExplanation(args: {
  userId: string;
  projectId: string;
  month: string;
  explanation: DecisionExplanation;
}): Promise<void> {
  const { userId, projectId, month, explanation } = args;
  const admin = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // decision_explanations has a unique index on (project_id, month). We do
  // the explicit branch because the rest of the codebase already uses this
  // pattern for partial unique indexes (sales_sources) and a plain
  // (project_id, month) unique index would still work with .upsert — but
  // splitting INSERT vs UPDATE keeps the call shape consistent with the
  // rest of the decision pipeline.
  const { data: existing, error: selErr } = await admin
    .from("decision_explanations")
    .select("id")
    .eq("project_id", projectId)
    .eq("month", month)
    .maybeSingle();

  if (selErr) {
    console.warn(
      `[explanation-cache] pre-save lookup failed (${projectId}/${month}): ${selErr.message}`
    );
    return;
  }

  if (existing?.id) {
    const { error: updErr } = await admin
      .from("decision_explanations")
      .update({
        explanation,
        computed_at: nowIso,
        // updated_at is set by trigger, but we set it explicitly so the
        // value matches computed_at for the same write — easier to reason
        // about than two timestamps drifting by milliseconds.
        updated_at: nowIso,
      })
      .eq("id", existing.id);
    if (updErr) {
      console.warn(
        `[explanation-cache] update failed (${projectId}/${month}): ${updErr.message}`
      );
    }
    return;
  }

  const { error: insErr } = await admin
    .from("decision_explanations")
    .insert({
      user_id: userId,
      project_id: projectId,
      month,
      explanation,
      computed_at: nowIso,
    });
  if (insErr) {
    console.warn(
      `[explanation-cache] insert failed (${projectId}/${month}): ${insErr.message}`
    );
  }
}
