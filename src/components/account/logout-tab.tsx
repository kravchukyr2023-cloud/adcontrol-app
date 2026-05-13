"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Props = {
  onLoggedOut: () => void;
};

export default function LogoutTab({ onLoggedOut }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      onLoggedOut();
      router.push("/landing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center py-8">

      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-300 mb-6">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </div>

      <h3 className="text-xl font-semibold mb-3">
        Log out of AdControl?
      </h3>
      <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
        You will be returned to the landing page. Your data stays safe — you can log back in any time.
      </p>

      <button
        onClick={handleLogout}
        disabled={loading}
        className="h-11 px-8 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm transition disabled:opacity-50"
      >
        {loading ? "Logging out…" : "Logout"}
      </button>

    </div>
  );
}
