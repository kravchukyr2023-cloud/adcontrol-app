export default function CTASection() {
  return (
    <section className="bg-black text-white py-40 border-t border-zinc-900">

      <div className="max-w-5xl mx-auto px-8 text-center">

        <p className="text-zinc-500 uppercase tracking-[0.2em] text-sm mb-6">
          Start Operating Smarter
        </p>

        <h2 className="text-6xl font-bold leading-tight mb-8">
          Stop guessing
          <br />
          where the budget disappears.
        </h2>

        <p className="text-zinc-400 text-xl leading-relaxed max-w-3xl mx-auto mb-12">
          Connect advertising, sales and attribution
          into one operating system designed
          for marketers, operators and agencies.
        </p>

        <div className="flex items-center justify-center gap-4">

          <button className="bg-white text-black px-7 py-4 rounded-xl font-medium hover:bg-zinc-200 transition">
            Start Free
          </button>

          <button className="border border-zinc-700 px-7 py-4 rounded-xl hover:border-zinc-500 transition">
            View Demo
          </button>

        </div>

      </div>

    </section>
  );
}
