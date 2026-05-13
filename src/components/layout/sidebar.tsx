"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ProjectSwitcher from "./project-switcher";
import AccountCenterModal from "@/components/account/account-center-modal";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    href: "/meta",
    label: "Meta Ads",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
  },
  {
    href: "/sales",
    label: "Sales & Attribution",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M21 7h-6M21 7v6" />
      </svg>
    ),
  },
  {
    href: "/utm",
    label: "UTM Generator",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    href: "/data-sources",
    label: "Data Sources",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  const initials = email
    ? email.slice(0, 2).toUpperCase()
    : "AC";

  return (
    <aside className="w-64 shrink-0 bg-[#0B1020] border-r border-[#1B2238] flex flex-col">

      <div className="px-5 py-5 border-b border-[#1B2238]">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            AC
          </span>
          <span className="text-white text-sm font-semibold tracking-tight">
            AdControl
          </span>
        </Link>
      </div>

      <div className="px-3 py-4 border-b border-[#1B2238]">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 px-1">
          Project
        </p>
        <ProjectSwitcher />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#6D5EF8]/15 border border-[#6D5EF8]/30 text-white text-sm transition"
                  : "flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent text-zinc-400 hover:text-white hover:bg-[#1B2238]/40 text-sm transition"
              }
            >
              <span
                className={
                  active ? "text-[#a99cff]" : "text-zinc-500"
                }
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[#1B2238]">
        <button
          onClick={() => setAccountOpen(true)}
          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#1B2238]/40 transition text-left"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {email || "User"}
            </p>
            <p className="text-[11px] text-zinc-500">Starter</p>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-500 shrink-0"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <AccountCenterModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        email={email}
      />
    </aside>
  );
}
