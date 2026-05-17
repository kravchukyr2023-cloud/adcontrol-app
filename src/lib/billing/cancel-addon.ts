import { ADDONS, AddonCounts, AddonId } from "@/config/plans";
import { setPaidAddon } from "./save-paid-addons";
import { recordBillingEvent } from "./record-billing-event";
import { applySummaryUpdate } from "./update-billing-summary";
import { toDbAddonType } from "./addon-type-mapping";
import { getPaidAddons } from "./get-paid-addons";
import { pauseResourceByAddonType } from "@/lib/resources/pause-resource-by-addon";

const ALL_IDS: AddonId[] = [
  "extraProjectPackage",
  "extraProjectBusinessManager",
  "extraProjectAdAccount",
  "existingProjectBusinessManager",
  "existingProjectAdAccount",
];

export async function cancelAddon(id: AddonId): Promise<void> {
  const paid = await getPaidAddons();
  const oldQ = paid[id];
  if (oldQ <= 0) return;

  const newQ = oldQ - 1;
  await setPaidAddon(id, newQ);

  await pauseResourceByAddonType(toDbAddonType(id));

  await recordBillingEvent({
    event_type: "addon_cancellation",
    addon_type: toDbAddonType(id),
    quantity: 1,
    amount: 0,
    status: "canceled",
  });

  const newPaid: AddonCounts = { ...paid, [id]: newQ };
  let monthlyAddons = 0;
  for (const aid of ALL_IDS) {
    monthlyAddons += newPaid[aid] * ADDONS[aid].priceMonthly;
  }

  await applySummaryUpdate({
    current_monthly_addons_amount: monthlyAddons,
  });
}
