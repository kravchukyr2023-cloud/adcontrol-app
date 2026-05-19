import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * MUST use @supabase/ssr (not @supabase/supabase-js) so the auth session is
 * persisted in HTTP cookies instead of localStorage. The cookie storage is
 * what allows server-side route handlers (e.g. /api/meta/*) to read the
 * authenticated user via getServerSupabase() — without it, the server sees
 * no cookies and every Meta API call returns Unauthorized.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
