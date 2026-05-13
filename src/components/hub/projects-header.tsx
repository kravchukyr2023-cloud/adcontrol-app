"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ProjectsHeader() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  const initials = email
    ? email.slice(0, 2).toUpperCase()
    : "AC";

  return (
    <header className="sticky top-0 z-40 bg-[#050816]/80 backdrop-blur border-b border-[#1B2238]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

        <Link href="/projects" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            AC
          </span>
          <span className="text-white text-sm font-semibold tracking-tight">
            AdControl
          </span>
        </Link>

        <div className="flex items-center gap-3">

          <div className="hidden md:flex items-center border border-[#1B2238] rounded-md text-xs overflow-hidden">
            <button className="px-2 py-1 text-white bg-[#0B1020]">EN</button>
            <button className="px-2 py-1 text-zinc-500 hover:text-zinc-300 transition">
              UK
            </button>
          </div>

          <button
            aria-label="Toggle theme"
            className="hidden md:flex w-8 h-8 items-center justify-center text-zinc-400 hover:text-white border border-[#1B2238] rounded-md transition"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#0B1020] border border-[#1B2238] flex items-center justify-center text-xs text-zinc-300">
              {initials}
            </div>
            <span className="hidden md:inline text-xs text-zinc-400 max-w-[140px] truncate">
              {email}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="text-sm text-zinc-400 hover:text-white border border-[#1B2238] hover:border-zinc-700 rounded-md px-3 py-1.5 transition"
          >
            Logout
          </button>

        </div>
      </div>
    </header>
  );
}
