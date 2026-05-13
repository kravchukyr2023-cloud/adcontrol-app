"use client";

import { useEffect, useState } from "react";

import AccountTabs, { AccountTab } from "./account-tabs";
import ProfileTab from "./profile-tab";
import BillingTab from "./billing-tab";
import SupportTab from "./support-tab";
import LogoutTab from "./logout-tab";

type Props = {
  open: boolean;
  onClose: () => void;
  email: string;
};

export default function AccountCenterModal({
  open,
  onClose,
  email,
}: Props) {
  const [tab, setTab] = useState<AccountTab>("profile");

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const name = email ? email.split("@")[0] : "User";
  const initials = email
    ? email.slice(0, 2).toUpperCase()
    : "AC";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0F111A] border border-[#2A2D3A] rounded-3xl flex flex-col max-h-[90vh] overflow-hidden"
      >

        <div className="relative px-7 pt-7 pb-6 border-b border-[#2A2D3A]">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 rounded-full text-zinc-400 hover:text-white hover:bg-[#2A2D3A] flex items-center justify-center transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-2xl font-bold tracking-tight pr-12">
            Account Center
          </h2>
          <p className="text-sm text-zinc-400 mt-1 mb-6 max-w-xl">
            Manage your profile, billing, support and account session.
          </p>

          <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B0D14] border border-[#2A2D3A]">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-white truncate">
                {name}
              </p>
              <p className="text-xs text-zinc-400 truncate">
                {email || "—"}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded-full shrink-0">
              Active
            </span>
          </div>
        </div>

        <AccountTabs active={tab} onChange={setTab} />

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {tab === "profile" && <ProfileTab email={email} />}
          {tab === "billing" && <BillingTab />}
          {tab === "support" && <SupportTab />}
          {tab === "logout" && <LogoutTab onLoggedOut={onClose} />}
        </div>

      </div>
    </div>
  );
}
