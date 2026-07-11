import Link from "next/link";
import { en } from "@/messages/en";

export default function CTASection() {
  const t = en.cta;
  return (
    <section className="bg-[#090A0F] text-white py-28 lg:py-36 border-b border-zinc-900">
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">

        <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
          {t.label}
        </p>

        <h2 className="text-4xl lg:text-6xl font-bold leading-[1.05] tracking-tight mb-10">
          {t.h2}
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth"
            className="bg-white text-black px-6 py-4 rounded-xl font-medium hover:bg-zinc-200 transition"
          >
            {t.primary}
          </Link>
          <Link
            href="/auth"
            className="border border-zinc-700 px-6 py-4 rounded-xl hover:border-zinc-500 transition"
          >
            {t.secondary}
          </Link>
        </div>

      </div>
    </section>
  );
}
