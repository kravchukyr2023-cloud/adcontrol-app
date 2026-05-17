import { supabase } from "@/lib/supabase/client";

export async function lockExtraResources(): Promise<void> {
  try {
    const ts = new Date().toISOString();

    await supabase
      .from("project_business_managers")
      .update({
        is_locked: true,
        is_paused: true,
        locked_reason: "payment_paused",
        updated_at: ts,
      })
      .eq("is_extra_paid", true);

    await supabase
      .from("business_manager_ad_accounts")
      .update({
        is_locked: true,
        is_paused: true,
        locked_reason: "payment_paused",
        updated_at: ts,
      })
      .eq("is_extra_paid", true);
  } catch {
    // Defensive: ignore if tables not present.
  }
}

export async function unlockExtraResources(): Promise<void> {
  try {
    const ts = new Date().toISOString();

    await supabase
      .from("project_business_managers")
      .update({
        is_locked: false,
        is_paused: false,
        locked_reason: null,
        updated_at: ts,
      })
      .eq("is_extra_paid", true)
      .eq("locked_reason", "payment_paused");

    await supabase
      .from("business_manager_ad_accounts")
      .update({
        is_locked: false,
        is_paused: false,
        locked_reason: null,
        updated_at: ts,
      })
      .eq("is_extra_paid", true)
      .eq("locked_reason", "payment_paused");
  } catch {
    // Defensive.
  }
}
