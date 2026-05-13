const FILTERS = ["All", "Active", "Paused", "Learning", "Limited"];

const COLS = [
  { key: "name", label: "Campaign", align: "left" as const },
  { key: "status", label: "Status", align: "left" as const },
  { key: "objective", label: "Objective", align: "left" as const },
  { key: "spend", label: "Spend", align: "right" as const },
  { key: "purchases", label: "Purchases", align: "right" as const },
  { key: "cpa", label: "CPA", align: "right" as const },
  { key: "impressions", label: "Impressions", align: "right" as const },
  { key: "cpm", label: "CPM", align: "right" as const },
  { key: "clicks", label: "Clicks", align: "right" as const },
  { key: "cpc", label: "CPC", align: "right" as const },
  { key: "ctr", label: "CTR", align: "right" as const },
  { key: "revenue", label: "Revenue", align: "right" as const },
  { key: "roas", label: "ROAS", align: "right" as const },
  { key: "actions", label: "", align: "right" as const },
];

export default function MetaAdsPage() {
  return (
    <div className="space-y-6">

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Meta Ads
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Campaigns, ad sets and creatives across your Meta business managers.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search campaigns…"
              className="w-full h-10 pl-10 pr-3.5 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-500"
            />
          </div>

          <select className="h-10 px-3 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-zinc-200 focus:border-[#6D5EF8]">
            <option>All Business Managers</option>
          </select>

          <select className="h-10 px-3 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-zinc-200 focus:border-[#6D5EF8]">
            <option>All Ad Accounts</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              className={
                i === 0
                  ? "h-8 px-3 rounded-lg text-xs border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white transition"
                  : "h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition"
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">

        <div className="px-6 py-4 border-b border-[#1B2238] bg-[#181A24] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              BM
            </span>
            <p className="text-sm font-semibold">
              No business manager connected
            </p>
            <span className="text-zinc-700">/</span>
            <span className="text-xs text-zinc-500">
              No ad account
            </span>
          </div>
          <span className="text-xs text-zinc-500">0 campaigns</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={
                      c.align === "right"
                        ? "text-right px-3 py-3 font-medium"
                        : "text-left px-3 py-3 font-medium"
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={COLS.length}
                  className="text-center px-6 py-14 text-zinc-500 text-sm"
                >
                  Connect Meta Ads to load campaigns, ad sets and creatives.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
