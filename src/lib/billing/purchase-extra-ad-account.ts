import { purchaseAddons } from "./purchase-addons";

/**
 * Extra Ad Account purchase = capacity-only.
 * Increases AA limit, does NOT create rows.
 */
export async function purchaseExtraAdAccount(
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;

  await purchaseAddons({
    existingProjectAdAccount: quantity,
  });
}
