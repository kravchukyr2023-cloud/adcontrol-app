export default function ProductPreview() {
  return (
    <section className="bg-black text-white py-32 border-t border-zinc-900">

      <div className="max-w-7xl mx-auto px-8">

        <div className="max-w-4xl mb-20">

          <p className="text-zinc-500 uppercase tracking-[0.2em] text-sm mb-6">
            Product Overview
          </p>

          <h2 className="text-5xl font-bold leading-tight mb-8">
            One operating system
            <br />
            for advertising decisions.
          </h2>

          <p className="text-zinc-400 text-xl leading-relaxed">
            AdControl connects advertising spend,
            real revenue and attribution into one decision layer.
          </p>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Dashboard */}
          <div className="border border-zinc-800 rounded-3xl p-8 bg-zinc-950">

            <div className="mb-8">
              <span className="text-zinc-500 text-sm">
                Dashboard
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">

              <div className="bg-black rounded-2xl p-5 border border-zinc-800">
                <p className="text-zinc-500 text-sm">Spend</p>
                <p className="text-2xl font-bold mt-2">$12,480</p>
              </div>

              <div className="bg-black rounded-2xl p-5 border border-zinc-800">
                <p className="text-zinc-500 text-sm">Revenue</p>
                <p className="text-2xl font-bold mt-2">$41,900</p>
              </div>

              <div className="bg-black rounded-2xl p-5 border border-zinc-800">
                <p className="text-zinc-500 text-sm">Real ROAS</p>
                <p className="text-2xl font-bold mt-2">3.36</p>
              </div>

              <div className="bg-black rounded-2xl p-5 border border-zinc-800">
                <p className="text-zinc-500 text-sm">CPA</p>
                <p className="text-2xl font-bold mt-2">$28</p>
              </div>

            </div>

            <div className="border border-zinc-800 rounded-2xl p-5 bg-black">
              <p className="text-zinc-500 text-sm mb-2">
                Decision Engine
              </p>

              <p className="text-sm text-white">
                Retargeting campaigns are outperforming target ROAS.
                Scaling opportunity detected.
              </p>
            </div>

          </div>

          {/* Attribution */}
          <div className="border border-zinc-800 rounded-3xl p-8 bg-zinc-950">

            <div className="mb-8">
              <span className="text-zinc-500 text-sm">
                Sales & Attribution
              </span>
            </div>

            <div className="space-y-4">

              <div className="flex items-center justify-between border border-zinc-800 rounded-2xl p-5 bg-black">
                <div>
                  <p className="font-medium">
                    Shopify Orders
                  </p>

                  <p className="text-zinc-500 text-sm mt-1">
                    Revenue tracking connected
                  </p>
                </div>

                <span className="text-green-400 text-sm">
                  Connected
                </span>
              </div>

              <div className="flex items-center justify-between border border-zinc-800 rounded-2xl p-5 bg-black">
                <div>
                  <p className="font-medium">
                    Google Sheets
                  </p>

                  <p className="text-zinc-500 text-sm mt-1">
                    Attribution source active
                  </p>
                </div>

                <span className="text-green-400 text-sm">
                  Active
                </span>
              </div>

              <div className="border border-zinc-800 rounded-2xl p-5 bg-black">
                <p className="text-zinc-500 text-sm mb-2">
                  Attribution Insight
                </p>

                <p className="text-sm text-white">
                  22% of orders are unmatched.
                  UTM cleanup recommended.
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>

    </section>
  );
}
