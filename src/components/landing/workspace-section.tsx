import { en } from "@/messages/en";

export default function WorkspaceSection() {
  const t = en.workspace;
  return (
    <section
      id="product"
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {t.modules.map((m) => (
            <div
              key={m.name}
              className="border border-zinc-800 rounded-2xl bg-zinc-950 p-8 flex flex-col"
            >
              <h3 className="text-xl font-semibold mb-4">{m.name}</h3>
              <p className="text-base text-zinc-400 leading-relaxed">
                {m.body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-zinc-500">{t.more}</p>

      </div>
    </section>
  );
}
