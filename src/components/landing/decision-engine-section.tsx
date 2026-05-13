const signals = [
  "Revenue leaks",
  "Scaling opportunities",
  "Attribution gaps",
  "Priority actions",
];

export default function DecisionEngineSection() {
  return (
    <section className="bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          <div>
            <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
              Decision engine
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight mb-6">
              Ad Decision Engine. Diagnosis, not dashboards.
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed mb-10">
              AdControl surfaces what matters and tells you what to do next — instead of leaving you to interpret another chart.
            </p>

            <ul className="space-y-4">
              {signals.map((s) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center text-indigo-300 text-[11px]">
                    ✓
                  </span>
                  <span className="text-zinc-200">{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 bg-gradient-to-br from-indigo-500/20 to-purple-600/10 rounded-3xl blur-2xl" />
            <div className="relative border border-zinc-800 rounded-2xl bg-zinc-950 p-7 shadow-2xl">

              <div className="flex items-center gap-2 text-xs text-rose-300 mb-5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Revenue leak detected
              </div>

              <h3 className="text-xl font-semibold mb-6">
                Campaign overspending against zero attributed revenue
              </h3>

              <div className="space-y-4 text-sm">
                <div className="border border-zinc-800 rounded-xl p-4 bg-black/30">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                    Signal
                  </p>
                  <p className="text-zinc-300">
                    Spend +18% this week, real ROAS dropped from 2.9 to 0.6.
                  </p>
                </div>

                <div className="border border-zinc-800 rounded-xl p-4 bg-black/30">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                    Diagnosis
                  </p>
                  <p className="text-zinc-300">
                    Broad-targeting campaign is no longer converting on the original creative.
                  </p>
                </div>

                <div className="border border-indigo-500/40 rounded-xl p-4 bg-indigo-500/5">
                  <p className="text-[10px] text-indigo-300 uppercase tracking-wide mb-1">
                    Recommended action
                  </p>
                  <p className="text-white">
                    Pause the under-performing ad set and reallocate budget to top retargeting cluster.
                  </p>
                </div>
              </div>

              <button className="mt-6 w-full bg-white text-black py-2.5 rounded-xl font-medium text-sm hover:bg-zinc-200 transition">
                Open Diagnosis
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
