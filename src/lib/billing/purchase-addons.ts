import { ADDONS, AddonCounts, AddonId } from "@/config/plans";
import { setPaidAddon } from "./save-paid-addons";
import { recordBillingEvent } from "./record-billing-event";
import { applySummaryUpdate } from "./update-billing-summary";
import { toDbAddonType } from "./addon-type-mapping";
import { getPaidAddons } from "./get-paid-addons";

export type AddonDeltas = Partial<Record<AddonId, number>>;

const ALL_IDS: AddonId[] = [
  "extraProjectPackage",
  "extraProjectBusinessManager",
  "extraProjectAdAccount",
  "existingProjectBusinessManager",
  "existingProjectAdAccount",
];

export async function purchaseAddons(deltas: AddonDeltas): Promise<void> {
  const paid = await getPaidAddons();

  const newPaid: AddonCounts = { ...paid };
  for (const id of ALL_IDS) {
    const d = deltas[id] ?? 0;
    if (d === 0) continue;
    newPaid[id] = Math.max(0, paid[id] + d);
  }

  let totalAmount = 0;

  for (const id of ALL_IDS) {
    const oldQ = paid[id];
    const newQ = newPaid[id];
    if (oldQ === newQ) continue;

    await setPaidAddon(id, newQ);

    const diff = newQ - oldQ;
    if (diff > 0) {
      const addon = ADDONS[id];
      const amount = diff * addon.priceMonthly;
      totalAmount += amount;
      await recordBillingEvent({
        event_type: "addon_purchase",
        addon_type: toDbAddonType(id),
        quantity: diff,
        amount,
        status: "paid",
      });
    }
  }

  let monthlyAddons = 0;
  for (const id of ALL_IDS) {
    monthlyAddons += newPaid[id] * ADDONS[id].priceMonthly;
  }

  await applySummaryUpdate({
    current_monthly_addons_amount: monthlyAddons,
    total_paid_delta: totalAmount,
    total_payments_delta: totalAmount > 0 ? 1 : 0,
    total_addon_payments_delta: totalAmount > 0 ? 1 : 0,
  });
}
