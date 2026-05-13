export default function PricingSection() {
  return (
    <section className="bg-black text-white py-32 border-t border-zinc-900">

      <div className="max-w-7xl mx-auto px-8">

        <div className="max-w-4xl mb-20">

          <p className="text-zinc-500 uppercase tracking-[0.2em] text-sm mb-6">
            Pricing
          </p>

          <h2 className="text-5xl font-bold leading-tight mb-8">
            Choose the operating level
            <br />
            for your advertising workflow.
          </h2>

          <p className="text-zinc-400 text-xl leading-relaxed">
            Start free. Upgrade when your projects,
            team and data operations grow.
          </p>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Starter */}
          <div className="border border-zinc-800 rounded-3xl p-8 bg-zinc-950 flex flex-col">

            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">
                Starter
              </h3>

              <p className="text-zinc-500">
                Free
              </p>
            </div>

            <ul className="space-y-4 text-sm text-zinc-400 flex-1">
              <li>1 Project</li>
              <li>1 Business Manager</li>
              <li>1 Ad Account</li>
              <li>Dashboard Overview</li>
              <li>Manual Data Sync</li>
            </ul>

            <button className="mt-10 border border-zinc-700 py-3 rounded-xl hover:border-zinc-500 transition">
              Start Free
            </button>

          </div>

          {/* Operator */}
          <div className="border border-white rounded-3xl p-8 bg-white text-black flex flex-col relative">

            <div className="absolute top-4 right-4 text-xs bg-black text-white px-3 py-1 rounded-full">
              Recommended
            </div>

            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">
                Operator
              </h3>

              <p className="text-zinc-600">
                $8.99 / month
              </p>
            </div>

            <ul className="space-y-4 text-sm text-zinc-700 flex-1">
              <li>3 Projects</li>
              <li>Google Sheets</li>
              <li>Sales & Attribution</li>
              <li>UTM Generator</li>
              <li>Full Decision Engine</li>
              <li>Auto Sync</li>
            </ul>

            <button className="mt-10 bg-black text-white py-3 rounded-xl hover:bg-zinc-800 transition">
              Choose Operator
            </button>

          </div>

          {/* Team */}
          <div className="border border-zinc-800 rounded-3xl p-8 bg-zinc-950 flex flex-col">

            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">
                Team
              </h3>

              <p className="text-zinc-500">
                $18.99 / month
              </p>
            </div>

            <ul className="space-y-4 text-sm text-zinc-400 flex-1">
              <li>5 Projects</li>
              <li>Shopify Integration</li>
              <li>Priority Sync</li>
              <li>Revenue Operations</li>
              <li>Advanced Diagnostics</li>
            </ul>

            <button className="mt-10 border border-zinc-700 py-3 rounded-xl hover:border-zinc-500 transition">
              Choose Team
            </button>

          </div>

          {/* Scale */}
          <div className="border border-zinc-800 rounded-3xl p-8 bg-zinc-950 flex flex-col">

            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">
                Scale
              </h3>

              <p className="text-zinc-500">
                $49.99 / month
              </p>
            </div>

            <ul className="space-y-4 text-sm text-zinc-400 flex-1">
              <li>15 Projects</li>
              <li>225 Ad Accounts</li>
              <li>Priority Support</li>
              <li>Multi-project Operations</li>
              <li>All Features Included</li>
            </ul>

            <button className="mt-10 border border-zinc-700 py-3 rounded-xl hover:border-zinc-500 transition">
              Choose Scale
            </button>

          </div>

        </div>

      </div>

    </section>
  );
}
