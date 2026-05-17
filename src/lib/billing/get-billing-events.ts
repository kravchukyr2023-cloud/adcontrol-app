import { supabase } from "@/lib/supabase/client";

export type BillingEvent = {
  id: string;
  event_type: string;
  plan_id: string | null;
  addon_type: string | null;
  quantity: number;
  amount: number;
  status: string;
  created_at: string;
};

export async function getBillingEvents(
  limit: number = 20
): Promise<BillingEvent[]> {
  try {
    const { data } = await supabase
      .from("billing_events")
      .select(
        "id, event_type, plan_id, addon_type, quantity, amount, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!data) return [];
    return data as BillingEvent[];
  } catch {
    return [];
  }
}
