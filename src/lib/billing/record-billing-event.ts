import { supabase } from "@/lib/supabase/client";

export type BillingEventInput = {
  event_type: string;
  plan_id?: string | null;
  addon_type?: string | null;
  quantity?: number;
  amount?: number;
  status?: string;
  metadata?: Record<string, unknown>;
};

export async function recordBillingEvent(
  event: BillingEventInput
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  await supabase.from("billing_events").insert({
    user_id: session.user.id,
    event_type: event.event_type,
    plan_id: event.plan_id ?? null,
    addon_type: event.addon_type ?? null,
    quantity: event.quantity ?? 0,
    amount: event.amount ?? 0,
    status: event.status ?? "paid",
    metadata: event.metadata ?? {},
  });
}
