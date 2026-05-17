import { purchaseAddons } from "./purchase-addons";

type Opts = {
  packages: number;
  nestedBMs: number;
  nestedAAs: number;
};

/**
 * Extra Project Package purchase = capacity-only.
 * Increases limits, does NOT create projects/BMs/AAs.
 * Resources are created when the user manually creates the project
 * (via Create Project Wizard) or adds BMs/AAs from a future resource manager.
 */
export async function purchaseExtraProjectPackage(
  opts: Opts
): Promise<void> {
  if (opts.packages <= 0 && opts.nestedBMs <= 0 && opts.nestedAAs <= 0) {
    return;
  }

  await purchaseAddons({
    extraProjectPackage: opts.packages,
    extraProjectBusinessManager: opts.nestedBMs,
    extraProjectAdAccount: opts.nestedAAs,
  });
}
