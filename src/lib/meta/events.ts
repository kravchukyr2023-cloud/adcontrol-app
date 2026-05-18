export const META_CONNECTION_CHANGED = "meta-connection-changed";

export function emitMetaConnectionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(META_CONNECTION_CHANGED));
}
