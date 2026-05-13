export default function ProblemSection() {
  return (
    <section className="bg-black text-white py-32 border-t border-zinc-900">

      <div className="max-w-7xl mx-auto px-8">

        <div className="max-w-4xl mb-20">

          <p className="text-zinc-500 uppercase tracking-[0.2em] text-sm mb-6">
            The Problem
          </p>

          <h2 className="text-5xl font-bold leading-tight mb-8">
            Meta Ads shows advertising numbers.
            <br />
            But not real business reality.
          </h2>

          <p className="text-zinc-400 text-xl leading-relaxed">
            Most advertisers optimize campaigns based on platform metrics,
            while real revenue, attribution and profitability remain unclear.
          </p>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-950">
            <h3 className="text-xl font-semibold mb-4">
              Fake ROAS
            </h3>

            <p className="text-zinc-500 leading-relaxed">
              Meta can report profitable campaigns while real revenue
              tells a completely different story.
            </p>
          </div>

          <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-950">
            <h3 className="text-xl font-semibold mb-4">
              Broken Attribution
            </h3>

            <p className="text-zinc-500 leading-relaxed">
              Sales data, UTM tracking and campaign attribution
              are usually disconnected and chaotic.
            </p>
          </div>

          <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-950">
            <h3 className="text-xl font-semibold mb-4">
              No Decision System
            </h3>

            <p className="text-zinc-500 leading-relaxed">
              Most dashboards show charts,
              but do not explain what should happen next.
            </p>
          </div>

        </div>

      </div>

    </section>
  );
}
