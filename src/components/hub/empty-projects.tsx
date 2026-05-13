type Props = {
  onCreate: () => void;
};

export default function EmptyProjects({ onCreate }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">

      <div className="w-16 h-16 rounded-2xl bg-[#0B1020] border border-[#1B2238] flex items-center justify-center text-3xl text-[#6D5EF8] mb-6">
        +
      </div>

      <h2 className="text-2xl font-semibold mb-3">
        Create your first workspace
      </h2>

      <p className="text-zinc-400 max-w-md mb-8">
        Connect your first marketing operation workspace.
      </p>

      <button
        onClick={onCreate}
        className="bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium px-6 py-3 rounded-xl transition"
      >
        Create Project
      </button>

    </div>
  );
}
