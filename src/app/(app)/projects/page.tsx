export default function ProjectsPage() {
  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Projects
          </h1>

          <p className="text-zinc-500 mt-2">
            Manage your advertising workspaces
          </p>
        </div>

        <button className="bg-white text-black px-5 py-2 rounded-lg font-medium hover:bg-zinc-200 transition">
          Create Project
        </button>
      </div>

      {/* Empty State */}
      <div className="border border-zinc-800 rounded-2xl p-12 bg-zinc-950">

        <div className="max-w-xl">

          <h2 className="text-2xl font-semibold mb-4">
            No projects yet
          </h2>

          <p className="text-zinc-500 mb-8">
            Create your first project to start tracking advertising performance,
            revenue, attribution and diagnostics.
          </p>

          <button className="bg-white text-black px-5 py-2 rounded-lg font-medium hover:bg-zinc-200 transition">
            Create First Project
          </button>

        </div>

      </div>

    </div>
  );
}
