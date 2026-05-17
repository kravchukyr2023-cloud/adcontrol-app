export const BILLING_UPDATED_EVENT = "billing-updated";

export function emitBillingUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BILLING_UPDATED_EVENT));
}
