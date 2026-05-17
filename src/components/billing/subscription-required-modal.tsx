"use client";

import { useEffect } from "react";
import { openAccountCenter } from "@/lib/account-center/open";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SubscriptionRequiredModal({
  open,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function goBilling() {
    openAccountCenter("billing");
    onClose();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#0B1020] border border-[#1B2238] rounded-3xl p-7"
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-300 mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <p className="text-[11px] uppercase tracking-wider text-rose-300 mb-1">
          Payment required
        </p>
        <h2 className="text-xl font-semibold mb-3">
          Subscription payment required
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          Your paid plan and extra limits are currently paused because payment was not received. Restore payment to unlock:
        </p>

        <ul className="text-xs text-zinc-300 space-y-1.5 mb-6 border border-[#1B2238] bg-black/30 rounded-xl p-4">
          <li>· Extra projects</li>
          <li>· Business Managers</li>
          <li>· Ad Accounts</li>
          <li>· Paid features</li>
        </ul>

        <div className="flex flex-col gap-2">
          <button
            onClick={goBilling}
            className="h-11 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition"
          >
            Open Billing
          </button>
          <button
            disabled
            className="h-11 rounded-xl border border-[#1B2238] text-zinc-500 text-sm cursor-not-allowed"
          >
            Contact Support
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-5 text-center">
          Payments processing will be automated in Sprint 3.
        </p>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-9 h-9 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B2238] flex items-center justify-center transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
