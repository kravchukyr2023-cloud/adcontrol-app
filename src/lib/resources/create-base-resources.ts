import { insertBM } from "./insert-bm";
import { insertAdAccount } from "./insert-ad-account";

export async function createBaseResources(opts: {
  projectId: string;
  projectName: string;
  userId: string;
}): Promise<void> {
  try {
    const bm = await insertBM({
      project_id: opts.projectId,
      user_id: opts.userId,
      bm_name: `${opts.projectName} BM`,
      source_type: "manual",
      is_base_resource: true,
      is_extra_paid: false,
      addon_source_type: null,
    });

    if (!bm) return;

    await insertAdAccount({
      bm_id: bm.id,
      project_id: opts.projectId,
      user_id: opts.userId,
      ad_account_name: `${opts.projectName} Ad Account`,
      source_type: "manual",
      is_base_resource: true,
      is_extra_paid: false,
      addon_source_type: null,
    });
  } catch {
    // Defensive: tables may not exist yet (migration not run).
    // Project creation should not fail because of this.
  }
}
