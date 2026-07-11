import Link from "next/link";
import { en } from "@/messages/en";

export default function AccessSection() {
  const t = en.access;
  return (
    <section
      id="access"
      className="scroll-mt-20 bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            {t.label}
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight mb-6">
            {t.h2}
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed mb-10">
            {t.body}
          </p>

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
