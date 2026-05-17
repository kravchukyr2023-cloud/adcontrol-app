export type AccountTab = "profile" | "billing" | "support" | "logout";

export const OPEN_ACCOUNT_CENTER = "open-account-center";

export function openAccountCenter(tab?: AccountTab): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_ACCOUNT_CENTER, { detail: { tab } })
  );
}
