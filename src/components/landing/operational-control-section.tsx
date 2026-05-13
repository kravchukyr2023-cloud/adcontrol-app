const items = [
  {
    title: "Centralized marketing operations",
    body: "Every campaign, account and signal in one operating layer. Stop juggling tabs, screenshots and exports.",
  },
  {
    title: "Unified data, one workspace",
    body: "Ad spend, real revenue, attribution and business targets live together — not in five disconnected tools.",
  },
  {
    title: "Structured decision flow",
    body: "From signal to diagnosis to action. Every decision has a trace, not a guess from memory.",
  },
];

export default function OperationalControlSection() {
  return (
    <section className="bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            Why AdControl
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            Operational control, not just dashboards.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {items.map((it, i) => (
            <div
              key={it.title}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 p-7"
            >
              <p className="text-xs text-indigo-300 mb-4">0{i + 1}</p>
              <h3 className="text-xl font-semibold mb-3">{it.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
