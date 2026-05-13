export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-zinc-500 mt-2">
          Project overview, performance metrics and decision signals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <p className="text-zinc-500 text-sm">Spend</p>
          <p className="text-2xl font-bold mt-2">$0</p>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <p className="text-zinc-500 text-sm">Revenue</p>
          <p className="text-2xl font-bold mt-2">$0</p>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <p className="text-zinc-500 text-sm">Real ROAS</p>
          <p className="text-2xl font-bold mt-2">0.00</p>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <p className="text-zinc-500 text-sm">CPA</p>
          <p className="text-2xl font-bold mt-2">$0</p>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
        <h2 className="text-xl font-semibold mb-2">Ad Decision Engine</h2>
        <p className="text-zinc-500">
          Diagnostics will appear here after Meta Ads and sales sources are connected.
        </p>
      </div>
    </div>
  );
}
