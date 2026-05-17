import { ADDONS, AddonCounts } from "@/config/plans";

export function calculateAddonPrice(addons: AddonCounts): number {
  return (
    addons.extraProjectPackage * ADDONS.extraProjectPackage.priceMonthly +
    addons.extraProjectBusinessManager *
      ADDONS.extraProjectBusinessManager.priceMonthly +
    addons.extraProjectAdAccount *
      ADDONS.extraProjectAdAccount.priceMonthly +
    addons.existingProjectBusinessManager *
      ADDONS.existingProjectBusinessManager.priceMonthly +
    addons.existingProjectAdAccount *
      ADDONS.existingProjectAdAccount.priceMonthly
  );
}
