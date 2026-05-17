import { purchaseAddons } from "./purchase-addons";

type Opts = {
  packages: number;
  nestedAAs: number;
};

/**
 * Extra Business Manager Package purchase = capacity-only.
 * Increases BM/AA limits, does NOT create rows.
 */
export async function purchaseExtraBmPackage(opts: Opts): Promise<void> {
  if (opts.packages <= 0 && opts.nestedAAs <= 0) return;

  await purchaseAddons({
    existingProjectBusinessManager: opts.packages,
    extraProjectAdAccount: opts.nestedAAs,
  });
}
