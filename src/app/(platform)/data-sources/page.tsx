type SourceCard = {
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  status: "connected" | "locked" | "disconnected";
  statusLabel: string;
  cta?: { label: string; disabled?: boolean };
  note?: string;
};

const SOURCES: SourceCard[] = [
  {
    name: "Meta Ads",
    description:
      "Campaigns, ad sets, creatives and spend — directly from your Business Manager.",
    icon: "f",
    iconBg: "bg-[#1877F2]/15 border-[#1877F2]/30 text-blue-300",
    status: "connected",
    statusLabel: "Connected",
    note: "Managed automatically",
  },
  {
    name: "Shopify",
    description:
      "Sync real orders, revenue and AOV from your store as the source of truth.",
    icon: "S",
    iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    status: "locked",
    statusLabel: "Locked",
    cta: { label: "Upgrade to Team", disabled: true },
  },
  {
    name: "Google Sheets",
    description:
      "Pull orders or attribution data from your operational sheet.",
    icon: "G",
    iconBg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
    status: "disconnected",
    statusLabel: "Disconnected",
    cta: { label: "Connect", disabled: true },
  },
];

const statusStyles: Record<SourceCard["status"], string> = {
  connected:
    "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  locked: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  disconnected: "text-zinc-400 border-[#1B2238] bg-black/30",
};

export default function DataSourcesPage() {
  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Data Sources
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Connect Meta Ads, Shopify and Google Sheets as data sources for spend, revenue and attribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SOURCES.map((s) => (
          <div
            key={s.name}
            className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020] flex flex-col"
          >
            <div className="flex items-start justify-between mb-5">
              <div
                className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold ${s.iconBg}`}
              >
                {s.icon}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full ${statusStyles[s.status]}`}
              >
                {s.statusLabel}
              </span>
            </div>

            <h2 className="text-lg font-semibold text-white mb-2">
              {s.name}
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed flex-1 mb-5">
              {s.description}
            </p>

            {s.note && (
              <p className="text-xs text-zinc-500">{s.note}</p>
            )}

            {s.cta && (
              <button
                disabled={s.cta.disabled}
                className="mt-1 h-10 rounded-lg border border-[#1B2238] text-sm text-zinc-400 cursor-not-allowed"
              >
                {s.cta.label}
              </button>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
