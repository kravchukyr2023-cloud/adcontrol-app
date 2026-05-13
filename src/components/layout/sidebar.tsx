export default function Sidebar() {
  return (
    <aside className="w-64 border-r border-zinc-800 p-6">
      <h1 className="text-3xl font-bold mb-12">
        AdControl
      </h1>

      <nav className="flex flex-col gap-6 text-zinc-300">

        <a
          href="/dashboard"
          className="hover:text-white transition"
        >
          Dashboard
        </a>

        <a
          href="/projects"
          className="hover:text-white transition"
        >
          Projects
        </a>

        <a
          href="/settings"
          className="hover:text-white transition"
        >
          Settings
        </a>

        <a
          href="/account"
          className="hover:text-white transition"
        >
          Account
        </a>

      </nav>
    </aside>
  );
}
