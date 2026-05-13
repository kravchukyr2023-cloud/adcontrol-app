const steps = [
  { n: "01", t: "Connect data", b: "Plug in Meta Ads, sales sources and attribution. Everything in one operational view." },
  { n: "02", t: "Detect losses", b: "Find leaks the moment they happen — not at end-of-month review." },
  { n: "03", t: "Diagnose problems", b: "Move from a metric to a cause: which campaign, which ad set, which creative." },
  { n: "04", t: "Prioritize actions", b: "Most-impact moves first. No more random changes that cancel each other out." },
  { n: "05", t: "Execute decisions", b: "Apply the change in the source platform with a clear audit trail." },
  { n: "06", t: "Validate results", b: "Confirm the decision actually moved revenue, not just a dashboard number." },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how"
      className="scroll-mt-20 bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            How it works
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            From disconnected data to operational decisions.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 p-7"
            >
              <p className="text-3xl font-bold text-zinc-700 mb-5">{s.n}</p>
              <h3 className="text-lg font-semibold mb-3">{s.t}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
