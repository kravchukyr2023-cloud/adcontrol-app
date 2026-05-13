const modules = [
  {
    icon: "⟡",
    name: "Dashboard",
    body: "Spend, revenue and decision signals in one operational view.",
    chips: ["KPI", "Goals", "Alerts"],
  },
  {
    icon: "◆",
    name: "Meta Ads",
    body: "Campaigns, ad sets and creatives with diagnostic context.",
    chips: ["BM", "Accounts", "Creatives"],
  },
  {
    icon: "◯",
    name: "Sales & Attribution",
    body: "Real orders matched against ad spend and campaigns.",
    chips: ["Orders", "AOV", "Real ROAS"],
  },
  {
    icon: "⊕",
    name: "UTM Generator",
    body: "Structured tagging so attribution actually works.",
    chips: ["Presets", "Validation"],
  },
  {
    icon: "✎",
    name: "Data Sources",
    body: "Meta, Shopify, Google Sheets connected as operational sources.",
    chips: ["Meta", "Shopify", "Sheets"],
  },
  {
    icon: "⚙",
    name: "Business Control Center",
    body: "Currency, timezone, monthly goals and sync intervals.",
    chips: ["Goals", "Sync", "Plan"],
  },
];

export default function WorkspaceSection() {
  return (
    <section
      id="product"
      className="scroll-mt-20 bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            The product
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            One workspace. Spend, revenue, attribution, decisions.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m) => (
            <div
              key={m.name}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 p-6 flex flex-col"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 flex items-center justify-center">
                  {m.icon}
                </span>
                <h3 className="text-base font-semibold">{m.name}</h3>
              </div>

              <p className="text-sm text-zinc-400 leading-relaxed mb-5 flex-1">
                {m.body}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {m.chips.map((c) => (
                  <span
                    key={c}
                    className="text-[11px] text-zinc-400 border border-zinc-800 bg-black/30 px-2 py-0.5 rounded-md"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
