type Props = {
  id: string;
  name: string;
  currency: string;
  onOpen: (id: string) => void;
};

const mockMetrics = {
  roas: "3.2",
  spend: "$8.4k",
  revenue: "$26.8k",
  campaigns: "12",
};

function buildInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");

  return parts.join("") || "P";
}

export default function ProjectCard({
  id,
  name,
  currency,
  onOpen,
}: Props) {
  const initials = buildInitials(name);

  return (
    <div className="group bg-[#0B1020] border border-[#1B2238] rounded-3xl p-6 flex flex-col hover:border-[#6D5EF8]/60 transition">

      <div className="flex items-start justify-between mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white font-semibold">
          {initials}
        </div>

        <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-400/30 bg-emerald-400/5 px-2 py-1 rounded-full">
          Active
        </span>
      </div>

      <h3 className="text-lg font-semibold text-white mb-1 truncate">
        {name}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Meta Ads · {currency}
      </p>

      <div className="grid grid-cols-4 gap-2 mb-6">
        <Metric label="ROAS" value={mockMetrics.roas} />
        <Metric label="Spend" value={mockMetrics.spend} />
        <Metric label="Revenue" value={mockMetrics.revenue} />
        <Metric label="Camp." value={mockMetrics.campaigns} />
      </div>

      <button
        onClick={() => onOpen(id)}
        className="mt-auto text-sm font-medium text-[#a99cff] hover:text-white text-left transition"
      >
        Open Project →
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="text-sm font-semibold text-white mt-0.5">
        {value}
      </p>
    </div>
  );
}
