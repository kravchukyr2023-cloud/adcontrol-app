import Link from "next/link";
import { en } from "@/messages/en";

export default function AccessSection() {
  const t = en.access;
  return (
    <section
      id="access"
      className="scroll-mt-20 bg-[#090A0F] text-white py-32 lg:py-40"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-2xl">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            {t.label}
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight mb-6">
            {t.h2}
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed mb-10">
            {t.body}
          </p>

          <ul className="space-y-4 mb-10">
            {t.bullets.map((b) => (
              <li key={b} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center text-indigo-300 text-[11px]">
                  ✓
                </span>
                <span className="text-zinc-200">{b}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/auth"
            className="inline-flex items-center bg-white text-black px-5 py-3 rounded-xl font-medium hover:bg-zinc-200 transition"
          >
            {t.cta}
          </Link>
        </div>

      </div>
    </section>
  );
}
