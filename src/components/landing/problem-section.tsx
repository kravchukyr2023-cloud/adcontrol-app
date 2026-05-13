const cards = [
  {
    title: "Platform ROAS is not enough",
    body: "Meta reports a number that looks profitable while real revenue tells a different story.",
    color: "bg-indigo-500",
  },
  {
    title: "Data lives in silos",
    body: "Ads, sales, attribution and goals never sit in the same place at the same time.",
    color: "bg-cyan-500",
  },
  {
    title: "Numbers stop at metrics",
    body: "Dashboards show CTR, CPC, ROAS — but never explain what to do next.",
    color: "bg-amber-500",
  },
  {
    title: "Budget leaks before anyone sees it",
    body: "Spend keeps going while a campaign is already broken — and nothing surfaces it.",
    color: "bg-rose-500",
  },
];

export default function ProblemSection() {
  return (
    <section className="bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            The problem
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            Most ad accounts do not have a traffic problem. They have an operations problem.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div
              key={c.title}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 overflow-hidden"
            >
              <div className={`h-1 ${c.color}`} />
              <div className="p-6">
                <h3 className="text-base font-semibold mb-3 text-white">
                  {c.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
