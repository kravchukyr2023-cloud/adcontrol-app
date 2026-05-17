"use client";

import { useEffect } from "react";
import { ADDONS, Plan } from "@/config/plans";
import { openAccountCenter } from "@/lib/account-center/open";

type Props = {
  open: boolean;
  plan: Plan;
  currentLimit: number;
  onClose: () => void;
};

export default function ProjectLimitModal({
  open,
  plan,
  currentLimit,
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

  const pkg = ADDONS.extraProjectPackage;

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
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 mb-5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold mb-2">
          Project limit reached
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5">
          Your <span className="text-white">{plan.name}</span> plan allows{" "}
          <span className="text-white">{currentLimit}</span>{" "}
          {currentLimit === 1 ? "project" : "projects"}. Upgrade your plan or add an Extra Project Package.
        </p>

        <div className="border border-[#6D5EF8]/40 bg-[#6D5EF8]/10 rounded-2xl p-4 mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-violet-300 mb-1">
                Extra Project Package
              </p>
              <p className="text-2xl font-bold text-white">
                ${pkg.priceMonthly}
                <span className="text-sm font-normal text-zinc-400">
                  {" "}/ month
                </span>
              </p>
            </div>
          </div>
          <ul className="text-xs text-zinc-300 space-y-1.5">
            <li>+ 1 additional project</li>
            <li>+ 1 Business Manager</li>
            <li>+ 1 Ad Account</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={goBilling}
            className="h-11 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition"
          >
            Upgrade Plan
          </button>
          <button
            onClick={goBilling}
            className="h-11 rounded-xl bg-[#6D5EF8]/20 hover:bg-[#6D5EF8]/30 text-violet-200 font-medium text-sm transition"
          >
            Add Extra Project Package
          </button>
          <button
            disabled
            className="h-11 rounded-xl border border-[#1B2238] text-zinc-500 text-sm cursor-not-allowed"
          >
            Contact Support
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-5 text-center">
          Demo billing mode. Real payments will be connected later.
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
