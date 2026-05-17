"use client";

import { AccountTab } from "@/lib/account-center/open";

export type { AccountTab };

type Props = {
  active: AccountTab;
  onChange: (tab: AccountTab) => void;
};

const TABS: { id: AccountTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "billing", label: "Billing" },
  { id: "support", label: "Support" },
  { id: "logout", label: "Logout" },
];

export default function AccountTabs({ active, onChange }: Props) {
  return (
    <div className="px-7 py-3 border-b border-[#2A2D3A] overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={
                isActive
                  ? "px-4 py-2 text-sm font-medium text-white bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 rounded-lg transition"
                  : "px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-[#1B2238]/40 rounded-lg border border-transparent transition"
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
