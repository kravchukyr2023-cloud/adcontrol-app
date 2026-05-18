import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import { MetaBM } from "./fetch-business-managers";

export async function upsertBusinessManagers(params: {
  userId: string;
  connectionId: string;
  bms: MetaBM[];
}): Promise<void> {
  if (params.bms.length === 0) return;

  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const rows = params.bms.map((bm) => ({
    user_id: params.userId,
    connection_id: params.connectionId,
    meta_bm_id: bm.id,
    bm_name: bm.name,
    status: "active",
    deleted_at: null,
    last_synced_at: now,
    updated_at: now,
  }));

  await supabase
    .from("meta_business_managers")
    .upsert(rows, { onConflict: "user_id,meta_bm_id" });
}
