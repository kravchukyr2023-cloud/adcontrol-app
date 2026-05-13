const USAGE = [
  { label: "Projects", used: 1, max: 3 },
  { label: "Business Managers", used: 1, max: 3 },
  { label: "Meta Ad Accounts", used: 1, max: 3 },
];

const AVAILABLE = [
  "Dashboard",
  "Meta Ads",
  "Sales & Attribution",
  "UTM Generator",
  "Google Sheets",
  "Manual Orders",
  "Auto-sync",
  "Decision Engine",
];

const LOCKED = ["Shopify", "Priority Sync", "Priority Support"];

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function BillingTab() {
  return (
    <div className="space-y-6">

      <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 text-xs text-amber-300">
        Payments are not active in this demo.
      </div>

      <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Current plan
            </p>
            <div className="flex items-center gap-3 mt-1">
              <h3 className="text-2xl font-bold">Operator</h3>
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">$8.99 / Monthly</p>
            <p className="text-xs text-zinc-500 mt-3">
              Next billing date: April 12, 2026
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="text-sm bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium rounded-lg px-4 py-2 transition">
              Upgrade Plan
            </button>
            <button className="text-sm text-zinc-300 border border-[#2A2D3A] hover:border-zinc-700 rounded-lg px-4 py-2 transition">
              Cancel Subscription
            </button>
          </div>
        </div>
      </div>

      <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
        <h3 className="text-sm font-semibold mb-5">Usage</h3>
        <div className="space-y-5">
          {USAGE.map((u) => {
            const pct = Math.min(
              100,
              Math.round((u.used / u.max) * 100)
            );
            return (
              <div key={u.label}>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-zinc-300">{u.label}</span>
                  <span className="text-zinc-500">
                    {u.used} / {u.max}
                  </span>
                </div>
                <div className="h-1.5 bg-[#2A2D3A] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6D5EF8] rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
          <h3 className="text-sm font-semibold mb-4">
            Available features
          </h3>
          <ul className="space-y-2.5">
            {AVAILABLE.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 text-sm text-zinc-300"
              >
                <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-[11px] shrink-0">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
          <h3 className="text-sm font-semibold mb-4">
            Locked features
          </h3>
          <ul className="space-y-2.5">
            {LOCKED.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 text-sm text-zinc-400"
              >
                <span className="w-5 h-5 rounded-full bg-zinc-700/30 border border-zinc-600/40 flex items-center justify-center text-zinc-400 shrink-0">
                  <LockIcon />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

      </div>

    </div>
  );
}
