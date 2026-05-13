export default function Topbar() {
  return (
    <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">

      <div>
        <p className="text-sm text-zinc-400">
          AdControl V1
        </p>
      </div>

      <div className="flex items-center gap-4">

        <div className="text-sm text-zinc-500">
          Starter Plan
        </div>

        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
          Y
        </div>

      </div>

    </header>
  );
}
