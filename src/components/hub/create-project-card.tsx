type Props = {
  onClick: () => void;
};

export default function CreateProjectCard({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="bg-transparent border border-dashed border-[#1B2238] hover:border-[#6D5EF8]/60 rounded-3xl p-6 flex flex-col items-center justify-center min-h-[260px] text-zinc-400 hover:text-white transition"
    >
      <div className="w-12 h-12 rounded-2xl border border-[#1B2238] flex items-center justify-center mb-4 text-xl">
        +
      </div>
      <p className="text-sm font-medium mb-1">
        Create New Project
      </p>
      <p className="text-xs text-zinc-500 text-center max-w-[200px]">
        Start a new operational workspace.
      </p>
    </button>
  );
}
