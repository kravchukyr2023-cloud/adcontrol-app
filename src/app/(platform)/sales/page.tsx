const KPIS = [
  { label: "Revenue", value: "$0", note: "0 orders" },
  { label: "Orders", value: "0", note: "0 today" },
  { label: "AOV", value: "$0", note: "Across all sources" },
  { label: "Real ROAS", value: "0.0x", note: "vs Meta 0.0x" },
  { label: "Budget", value: "$0", note: "0% used" },
];

const COMPARE_COLS = [
  "Campaign / Ad Set / Ad",
  "Spend",
  "Meta Rev",
  "Real Rev",
  "Meta Sales",
  "Real Sales",
  "Meta CPA",
  "Real CPA",
  "Meta ROAS",
  "Real ROAS",
  "Diff",
  "Status",
];

const ORDER_COLS = [
  "Order ID",
  "Date",
  "Customer",
  "Product",
  "Revenue",
  "Sales Source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

const SOURCE_TABS = [
  { id: "shopify", label: "Shopify" },
  { id: "manual", label: "Manual" },
];

export default function SalesPage() {
  return (
    <div className="space-y-6">

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Sales & Attribution
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Real revenue, attribution and Meta-vs-real performance comparison.
          </p>
        </div>

        <button className="shrink-0 h-10 px-4 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition">
          + Add Order
        </button>
      </div>

      <section className="rounded-2xl border border-[#1B2238] bg-[#0B1020]">
        <div className="px-6 py-5 border-b border-[#1B2238] flex items-center gap-3">
          <h2 className="text-base font-semibold">
            Ad Decision Engine — Attribution
          </h2>
          <span className="text-[10px] uppercase bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 text-violet-300 px-2 py-0.5 rounded font-semibold">
            Beta
          </span>
        </div>

        <div className="p-6">
          <div className="border border-[#1B2238] rounded-xl p-5 bg-black/30 flex flex-col md:flex-row md:items-start gap-4">
            <span className="text-[10px] uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-1 rounded shrink-0 self-start">
              Attribution gap
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold mb-3">
                Real revenue lower than Meta-reported by 28%
              </h3>
              <p className="text-sm text-zinc-300 mb-4">
                Connect a sales source and align UTM tagging to reconcile platform and real numbers.
              </p>
              <div className="flex items-center gap-2">
                <button className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 transition">
                  Open Diagnosis
                </button>
                <button className="text-xs px-3 py-1.5 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPIS.map((k) => (
          <div
            key={k.label}
            className="border border-[#1B2238] rounded-2xl p-5 bg-[#0B1020]"
          >
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {k.label}
            </p>
            <p className="text-2xl font-bold mt-2">{k.value}</p>
            <p className="text-xs text-zinc-500 mt-2">{k.note}</p>
          </div>
        ))}
      </section>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Meta vs Real ROAS
          </h3>
          <span className="text-xs text-zinc-500">0 rows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                {COMPARE_COLS.map((c, i) => (
                  <th
                    key={c}
                    className={
                      i === 0
                        ? "text-left px-6 py-3 font-medium"
                        : "text-right px-3 py-3 font-medium"
                    }
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={COMPARE_COLS.length}
                  className="text-center px-6 py-12 text-zinc-500 text-sm"
                >
                  Connect Meta Ads and a sales source to compare reported vs real ROAS.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">

        <div className="px-6 py-4 border-b border-[#1B2238] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            {SOURCE_TABS.map((t, i) => (
              <button
                key={t.id}
                className={
                  i === 0
                    ? "h-8 px-3 rounded-lg text-xs border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white transition"
                    : "h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>
                Revenue: <span className="text-white">$0</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                Orders: <span className="text-white">0</span>
              </span>
            </div>
            <button className="h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition">
              Connect new source
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                {ORDER_COLS.map((c, i) => (
                  <th
                    key={c}
                    className={
                      i === 0
                        ? "text-left px-6 py-3 font-medium"
                        : "text-left px-3 py-3 font-medium"
                    }
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={ORDER_COLS.length}
                  className="text-center px-6 py-12 text-zinc-500 text-sm"
                >
                  No orders yet. Add a manual order or connect Shopify to import them.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-[#1B2238] flex items-center justify-between text-xs text-zinc-500">
          <span>Showing 0 of 0</span>
          <div className="flex items-center gap-1">
            <button
              disabled
              className="h-7 px-2 rounded-md border border-[#1B2238] disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled
              className="h-7 px-2 rounded-md border border-[#1B2238] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
