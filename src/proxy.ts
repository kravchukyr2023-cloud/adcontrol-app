import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 "proxy" handler (formerly `middleware`).
 *
 * Refreshes the Supabase auth session cookies on every request so that
 * server components and route handlers always see a fresh access token.
 *
 * Without this, the browser's cookie-backed session can go stale and
 * /api/meta/* routes start returning Unauthorized even after the user
 * logged in successfully.
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touch the session so @supabase/ssr can refresh it if needed.
  await supabase.auth.getUser();

  return res;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
