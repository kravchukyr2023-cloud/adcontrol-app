type Props = {
  id: string;
  name: string;
  currency: string;
  monthlyRevenueGoal: number;
  monthlyAdBudget: number;
  targetRoas: number;
  locked?: boolean;
  onOpen: (id: string) => void;
  onLockedClick?: () => void;
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
  locked,
  onOpen,
  onLockedClick,
}: Props) {
  const initials = buildInitials(name);

  function handleClick() {
    if (locked) {
      onLockedClick?.();
    } else {
      onOpen(id);
    }
  }

  return (
    <div
      className={
        locked
          ? "group bg-[#0B1020] border border-rose-500/30 rounded-3xl p-6 flex flex-col opacity-70"
          : "group bg-[#0B1020] border border-[#1B2238] rounded-3xl p-6 flex flex-col hover:border-[#6D5EF8]/60 transition"
      }
    >

      <div className="flex items-start justify-between mb-6">
        <div
          className={
            locked
              ? "w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500 font-semibold"
              : "w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white font-semibold"
          }
        >
          {initials}
        </div>

        {locked ? (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-300 border border-rose-500/40 bg-rose-500/10 px-2 py-1 rounded-full">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Paused
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-[#1B2238] bg-black/30 px-2 py-1 rounded-full">
            Waiting for integrations
          </span>
        )}
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
        <Metric label="Revenue" value={fmt(currency, monthlyRevenueGoal)} />
        <Metric label="Spend" value={fmt(currency, monthlyAdBudget)} />
        <Metric
          label="ROAS"
          value={targetRoas ? `${targetRoas.toFixed(1)}x` : "—"}
        />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        {locked
          ? "Paused — payment required"
          : "Meta not connected · No synced data"}
      </div>

      <button
        onClick={handleClick}
        className={
          locked
            ? "mt-auto text-sm font-medium text-rose-300 hover:text-white text-left transition"
            : "mt-auto text-sm font-medium text-[#a99cff] hover:text-white text-left transition"
        }
      >
        {locked ? "Restore access →" : "Open Project →"}
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
