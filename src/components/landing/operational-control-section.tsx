import { en } from "@/messages/en";

export default function OperationalControlSection() {
  const t = en.operationalControl;
  return (
    <section className="bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900">
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
          {t.items.map((it, i) => (
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
