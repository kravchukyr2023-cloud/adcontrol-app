import { en } from "@/messages/en";

export default function ProblemSection() {
  const t = en.problem;
  return (
    <section className="bg-[#090A0F] text-white py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            {t.label}
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            {t.h2}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.cards.map((c) => (
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
