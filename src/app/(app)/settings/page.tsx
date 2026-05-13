export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Business Control Center</h1>
        <p className="text-zinc-500 mt-2">
          Configure project goals, currency, timezone and sync settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
          <h2 className="text-xl font-semibold mb-4">General</h2>

          <div className="space-y-4 text-sm text-zinc-400">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>Currency</span>
              <span>USD</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>Timezone</span>
              <span>Europe/Bucharest</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>Auto-sync</span>
              <span>Locked on Starter</span>
            </div>

            <div className="flex items-center justify-between">
              <span>Sync interval</span>
              <span>Manual</span>
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
          <h2 className="text-xl font-semibold mb-4">Monthly Goals</h2>

          <div className="space-y-4 text-sm text-zinc-400">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>Revenue Goal</span>
              <span>$0</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>Ad Budget</span>
              <span>$0</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>Target ROAS</span>
              <span>0.00</span>
            </div>

            <div className="flex items-center justify-between">
              <span>Target CPA</span>
              <span>$0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
