export default function AccountPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Account Center</h1>
        <p className="text-zinc-500 mt-2">
          Manage profile, billing, support and logout.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <h2 className="font-semibold mb-2">Profile</h2>
          <p className="text-zinc-500 text-sm">Name, email, language and theme.</p>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <h2 className="font-semibold mb-2">Billing</h2>
          <p className="text-zinc-500 text-sm">Current plan, limits and usage.</p>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <h2 className="font-semibold mb-2">Support</h2>
          <p className="text-zinc-500 text-sm">Email and Telegram support.</p>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
          <h2 className="font-semibold mb-2">Logout</h2>
          <p className="text-zinc-500 text-sm">Sign out from your account.</p>
        </div>
      </div>
    </div>
  );
}
