import { en } from "@/messages/en";

export default function HowItWorksSection() {
  const t = en.howItWorks;
  return (
    <section
      id="how"
      className="scroll-mt-20 bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            {t.label}
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            {t.h2}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {t.steps.map((s) => (
            <div
              key={s.n}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 p-10"
            >
              <p className="text-4xl font-bold text-zinc-700 mb-6">{s.n}</p>
              <h3 className="text-2xl font-semibold mb-4">{s.t}</h3>
              <p className="text-base text-zinc-400 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
