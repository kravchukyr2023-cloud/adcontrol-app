import { en } from "@/messages/en";

export default function SecuritySection() {
  const t = en.security;
  return (
    <section
      id="security"
      className="scroll-mt-20 bg-[#090A0F] text-white py-20 lg:py-24"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {t.points.map((p) => (
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
