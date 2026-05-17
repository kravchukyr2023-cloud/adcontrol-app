"use client";

import { useActiveProject } from "@/hooks/use-active-project";

type Severity = "critical" | "warning" | "opportunity";

type Diagnosis = {
  severity: Severity;
  title: string;
  impact: string;
  diagnosis: string;
  action: string;
  expected: string;
};

const DIAGNOSES: Diagnosis[] = [
  {
    severity: "critical",
    title: "Spend +18% with no attributed revenue",
    impact: "$2,400 spent, 0 conversions tracked",
    diagnosis: "Broad-audience campaign no longer converting on current creative",
    action: "Pause campaign and reallocate to top retargeting cluster",
    expected: "+$1,800 monthly revenue recovered",
  },
  {
    severity: "warning",
    title: "CPA exceeds target by 32%",
    impact: "12 conversions at $46 CPA vs $35 target",
    diagnosis: "Ad set 'Lookalike 1%' under-performing this week",
    action: "Trim audience size and refresh creative",
    expected: "−$130/day cost reduction",
  },
];

const severityStyles: Record<Severity, string> = {
  critical: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  warning: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  opportunity: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
};

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  opportunity: "Opportunity",
};

const SPEND_BARS = [40, 55, 48, 70, 60, 75, 90];
const ROAS_POINTS_CAB = "0,80 30,60 60,65 90,45 120,55 150,35 180,40";
const ROAS_POINTS_REAL = "0,90 30,75 60,80 90,60 120,70 150,55 180,58";

function fmt(currency: string, value: number): string {
  if (!value) return `${currency} 0`;
  return `${currency} ${value.toLocaleString()}`;
}

export default function DashboardPage() {
  const { project } = useActiveProject();

  const currency = project?.currency ?? "USD";
  const targetRevenue = project?.monthly_revenue_goal ?? 0;
  const targetBudget = project?.monthly_ad_budget ?? 0;
  const targetRoas = project?.target_roas ?? 0;
  const targetCpa = project?.target_cpa ?? 0;

  const KPIS = [
    {
      label: "Spend",
      value: fmt(currency, 0),
      note: `Budget ${fmt(currency, targetBudget)}`,
    },
    {
      label: "Revenue",
      value: fmt(currency, 0),
      note: `Goal ${fmt(currency, targetRevenue)}`,
    },
    {
      label: "Purchases",
      value: "0",
      note: "0 today",
    },
    {
      label: "CPA",
      value: fmt(currency, 0),
      note: `Target ${fmt(currency, targetCpa)}`,
    },
    {
      label: "ROAS",
      value: "0.0x",
      note: `Target ${targetRoas ? targetRoas.toFixed(1) : "0.0"}x`,
    },
  ];

  return (
    <div className="space-y-6">

      <section className="rounded-2xl border border-[#1B2238] bg-[#0B1020] overflow-hidden">

        <div className="px-6 py-5 border-b border-[#1B2238] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              Ad Decision Engine
            </h2>
            <span className="text-[10px] uppercase bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 text-violet-300 px-2 py-0.5 rounded font-semibold">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs">
            <button className="px-3 py-1.5 rounded-md bg-[#6D5EF8]/15 text-white border border-[#6D5EF8]/40">
              Revenue Leaks
            </button>
            <button className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white border border-transparent">
              Growth Opportunities
            </button>
            <button className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white border border-transparent">
              Priority Actions
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {DIAGNOSES.map((d, i) => (
            <div
              key={i}
              className="border border-[#1B2238] rounded-xl p-5 bg-black/30"
            >
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <span
                  className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded shrink-0 self-start ${severityStyles[d.severity]}`}
                >
                  {severityLabels[d.severity]}
                </span>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold mb-4">
                    {d.title}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Impact</p>
                      <p className="text-zinc-300">{d.impact}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Diagnosis</p>
                      <p className="text-zinc-300">{d.diagnosis}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Action</p>
                      <p className="text-zinc-300">{d.action}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Expected Result</p>
                      <p className="text-zinc-300">{d.expected}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 transition">
                      Accept task
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPIS.map((k) => (
          <div
            key={k.label}
            className="border border-[#1B2238] rounded-2xl p-5 bg-[#0B1020]"
          >
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {k.label}
            </p>
            <p className="text-2xl font-bold mt-2">{k.value}</p>
            <p className="text-xs text-zinc-500 mt-2">{k.note}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">
              Spend / Revenue / Revenue real
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">7d</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">
            Bars placeholder — chart layer comes later.
          </p>
          <div className="flex items-end justify-between gap-2 h-40">
            {SPEND_BARS.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-[#6D5EF8] to-[#a99cff] rounded-sm"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        <div className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">ROAS — cab vs real</h3>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">7d</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">Trend placeholder.</p>
          <svg viewBox="0 0 180 100" className="w-full h-40">
            <polyline
              points={ROAS_POINTS_CAB}
              stroke="#a99cff"
              fill="none"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <polyline
              points={ROAS_POINTS_REAL}
              stroke="#6D5EF8"
              fill="none"
              strokeWidth="2"
            />
          </svg>
          <div className="flex items-center gap-4 text-xs text-zinc-500 mt-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px bg-[#6D5EF8]" /> Real
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px border-t border-dashed border-[#a99cff]" /> Cab
            </span>
          </div>
        </div>

      </section>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] flex items-center justify-between">
          <h3 className="text-sm font-semibold">All campaigns</h3>
          <span className="text-xs text-zinc-500">0 campaigns</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Campaign</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="text-right px-3 py-3 font-medium">Spend</th>
                <th className="text-right px-3 py-3 font-medium">Revenue</th>
                <th className="text-right px-3 py-3 font-medium">ROAS</th>
                <th className="text-right px-3 py-3 font-medium">Conv.</th>
                <th className="text-right px-3 py-3 font-medium">CPA</th>
                <th className="text-right px-3 py-3 font-medium">CTR</th>
                <th className="text-right px-3 py-3 font-medium">CPC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={9}
                  className="text-center px-6 py-12 text-zinc-500 text-sm"
                >
                  No campaigns yet. Connect Meta Ads to populate this table.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
