import "server-only";
import { getAdminSupabase } from "./admin-supabase";

export type MetaEventType =
  | "connect"
  | "reconnect"
  | "disconnect"
  | "token_refresh"
  | "token_expired"
  | "permission_revoked"
  | "scope_change"
  | "error";

export type MetaEventStatus = "success" | "failed" | "partial";

export type RecordEventParams = {
  userId: string;
  connectionId: string | null;
  eventType: MetaEventType;
  status?: MetaEventStatus;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Insert a row into meta_connection_events.
 *
 * Errors are swallowed: failing to write an audit event must not
 * break the user-facing OAuth / disconnect / sync flows.
 */
export async function recordConnectionEvent(
  params: RecordEventParams
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase.from("meta_connection_events").insert({
      user_id: params.userId,
      connection_id: params.connectionId,
      event_type: params.eventType,
      status: params.status ?? "success",
      message: params.message ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Audit failure is non-fatal.
  }
}
