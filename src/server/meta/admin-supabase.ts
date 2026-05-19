import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/server/env";

let cached: SupabaseClient | null = null;

/**
 * Returns the service-role Supabase client.
 * Used ONLY for sensitive operations that need to bypass RLS:
 *   - meta_connection_tokens read/write
 *
 * Do NOT import this file from any client component or non-Meta code.
 */
export function getAdminSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cached;
}
