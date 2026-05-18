import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import { MetaAdAccount } from "./fetch-owned-ad-accounts";

export async function upsertAdAccounts(params: {
  userId: string;
  metaBusinessManagerRowId: string;
  accounts: MetaAdAccount[];
}): Promise<void> {
  if (params.accounts.length === 0) return;

  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const rows = params.accounts.map((a) => ({
    user_id: params.userId,
    meta_business_manager_id: params.metaBusinessManagerRowId,
    meta_ad_account_id: a.id,
    ad_account_name: a.name,
    meta_account_status_code:
      typeof a.account_status === "number" ? a.account_status : null,
    currency: a.currency,
    status: "active",
    deleted_at: null,
    last_synced_at: now,
    updated_at: now,
  }));

  await supabase
    .from("meta_ad_accounts")
    .upsert(rows, { onConflict: "user_id,meta_ad_account_id" });
}
