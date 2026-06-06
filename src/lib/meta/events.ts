export const META_CONNECTION_CHANGED = "meta-connection-changed";

export function emitMetaConnectionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(META_CONNECTION_CHANGED));
}

/**
 * Fired after the global topbar Sync finishes (success OR partial).
 * Pages consuming Meta analytics listen for this and refetch so their
 * tables/cards reflect the freshly-synced data without a hard reload.
 */
export const META_SYNC_COMPLETED = "meta-sync-completed";

export function emitMetaSyncCompleted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(META_SYNC_COMPLETED));
}
