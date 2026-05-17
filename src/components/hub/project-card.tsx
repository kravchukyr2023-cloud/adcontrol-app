type Props = {
  id: string;
  name: string;
  currency: string;
  monthlyRevenueGoal: number;
  monthlyAdBudget: number;
  targetRoas: number;
  onOpen: (id: string) => void;
};

function buildInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");

  return parts.join("") || "P";
}

function fmt(currency: string, value: number): string {
  if (!value) return `${currency} —`;
  if (value >= 1000) {
    return `${currency} ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  return `${currency} ${value.toLocaleString()}`;
}

export default function ProjectCard({
  id,
  name,
  currency,
  monthlyRevenueGoal,
  monthlyAdBudget,
  targetRoas,
  onOpen,
}: Props) {
  const initials = buildInitials(name);

  return (
    <div className="group bg-[#0B1020] border border-[#1B2238] rounded-3xl p-6 flex flex-col hover:border-[#6D5EF8]/60 transition">

      <div className="flex items-start justify-between mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white font-semibold">
          {initials}
        </div>

        <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-[#1B2238] bg-black/30 px-2 py-1 rounded-full">
          Waiting for integrations
        </span>
      </div>

      <h3 className="text-lg font-semibold text-white mb-1 truncate">
        {name}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Meta Ads · {currency}
      </p>

      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3">
        Monthly targets
      </p>
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Metric
          label="Revenue"
          value={fmt(currency, monthlyRevenueGoal)}
        />
        <Metric label="Spend" value={fmt(currency, monthlyAdBudget)} />
        <Metric
          label="ROAS"
          value={targetRoas ? `${targetRoas.toFixed(1)}x` : "—"}
        />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        Meta not connected · No synced data
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
      <p className="text-sm font-semibold text-white mt-0.5 truncate">
        {value}
      </p>
    </div>
  );
}
