export default function LandingHero() {
  return (
    <section className="min-h-screen bg-black text-white flex items-center">

      <div className="max-w-7xl mx-auto px-8 w-full">

        <div className="max-w-4xl">

          <div className="mb-6">
            <span className="text-zinc-500 text-sm border border-zinc-800 px-4 py-2 rounded-full">
              AdControl V1
            </span>
          </div>

          <h1 className="text-6xl font-bold leading-tight mb-8">
            Control advertising like an operation,
            not guessing.
          </h1>

          <p className="text-zinc-400 text-xl leading-relaxed max-w-2xl mb-10">
            Connect Meta Ads, sales sources and attribution
            into one operating system for decisions,
            diagnostics and scaling.
          </p>

          <div className="flex items-center gap-4">

            <button className="bg-white text-black px-6 py-3 rounded-xl font-medium hover:bg-zinc-200 transition">
              Start Free
            </button>

            <button className="border border-zinc-700 px-6 py-3 rounded-xl hover:border-zinc-500 transition">
              View Demo
            </button>

          </div>

        </div>

      </div>

    </section>
  );
}
