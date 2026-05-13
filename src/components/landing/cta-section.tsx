import Link from "next/link";

export default function CTASection() {
  return (
    <section className="bg-[#090A0F] text-white py-28 lg:py-36">
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">

        <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
          Get started
        </p>

        <h2 className="text-4xl lg:text-6xl font-bold leading-[1.05] tracking-tight mb-10">
          Create your operational marketing workspace.
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth"
            className="bg-white text-black px-6 py-4 rounded-xl font-medium hover:bg-zinc-200 transition"
          >
            Start free
          </Link>
          <Link
            href="/auth"
            className="border border-zinc-700 px-6 py-4 rounded-xl hover:border-zinc-500 transition"
          >
            View demo
          </Link>
        </div>

      </div>
    </section>
  );
}
