import "server-only";

/**
 * Shared utilities for Phase 2 upserters.
 *
 * Layer rules (per Phase 2 architecture):
 *   - DB persistence only.
 *   - No Meta API, no pagination, no events, no sync_states writes,
 *     no project/UI knowledge, no runtime budgets, no deadlines.
 *   - Bulk persistence via chunked UPSERT. Each chunk is committed
 *     independently — partial success is preserved.
 *   - Soft-delete with resurrection: status derived from incoming
 *     effective_status. Active row coming back after deletion flips
 *     back to status='active', deleted_at=NULL.
 */

export type UpsertResult = {
  /** True only if every chunk persisted successfully. */
  ok: boolean;
  /** Rows successfully persisted across all completed chunks. */
  persisted: number;
  /** Rows attempted (sum of input length). */
  attempted: number;
  /** Number of chunks the input was split into. */
  chunks: number;
  /** Per-chunk error messages (length = number of FAILED chunks). */
  errors: string[];
};

/**
 * Chunk sizes tuned for Supabase POST body limits (~1MB default).
 * Entity rows ≈ 0.5-1 KB; insight rows ≈ 2-5 KB with raw_actions jsonb.
 */
export const ENTITY_CHUNK_SIZE = 500;
export const INSIGHT_CHUNK_SIZE = 200;

export function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Soft-delete with resurrection.
 *
 * Mapping (Meta effective_status → unified status enum):
 *   DELETED                                  → 'deleted',  deleted_at=now
 *   ARCHIVED                                 → 'archived', deleted_at=now
 *   PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED    → 'paused',   deleted_at=NULL
 *   ACTIVE, IN_PROCESS, PENDING_REVIEW, etc. → 'active',   deleted_at=NULL
 *   null / unknown                           → 'active',   deleted_at=NULL
 *
 * On UPSERT, an entity previously stored with status='deleted' that
 * now returns from Meta with effective_status=ACTIVE will be UPDATEd
 * back to status='active' + deleted_at=NULL — full resurrection.
 */
export type StatusResolution = {
  status: "active" | "paused" | "archived" | "deleted";
  deleted_at: string | null;
};

export function resolveStatusFromEffective(
  effective: string | null,
  now: string = nowIso()
): StatusResolution {
  if (!effective) return { status: "active", deleted_at: null };
  const upper = effective.toUpperCase();
  if (upper === "DELETED") return { status: "deleted", deleted_at: now };
  if (upper === "ARCHIVED") return { status: "archived", deleted_at: now };
  if (
    upper === "PAUSED" ||
    upper === "CAMPAIGN_PAUSED" ||
    upper === "ADSET_PAUSED"
  ) {
    return { status: "paused", deleted_at: null };
  }
  return { status: "active", deleted_at: null };
}

export function emptyResult(): UpsertResult {
  return { ok: true, persisted: 0, attempted: 0, chunks: 0, errors: [] };
}
