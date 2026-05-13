const points = [
  {
    t: "Row-level access",
    b: "Each project is isolated at the database layer — users only see what they own.",
  },
  {
    t: "OAuth connections",
    b: "Data sources connect via official APIs. No credentials are stored in plain text.",
  },
  {
    t: "Privacy-first",
    b: "We do not sell, share or resell your advertising data. Ever.",
  },
];

export default function SecuritySection() {
  return (
    <section
      id="security"
      className="scroll-mt-20 bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            Security
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            Built so your data stays yours.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {points.map((p) => (
            <div
              key={p.t}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 p-6"
            >
              <h3 className="text-base font-semibold mb-3">{p.t}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{p.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
