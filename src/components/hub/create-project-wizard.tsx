"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const STEPS = ["General", "Setup", "Targets", "Data sources"];

const CURRENCIES = ["USD", "EUR", "GBP", "UAH", "PLN"];
const TIMEZONES = [
  "UTC",
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
];

const PROJECT_TYPES = [
  { value: "ecommerce", label: "Ecommerce" },
  { value: "lead_generation", label: "Lead generation" },
  { value: "online_education", label: "Online education" },
  { value: "other", label: "Other" },
];

const DATA_SOURCES = [
  {
    id: "shopify",
    name: "Shopify",
    desc: "Sync real orders, revenue and AOV from your store.",
    icon: "S",
    iconBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  },
  {
    id: "sheets",
    name: "Google Sheets",
    desc: "Pull orders or attribution from your operational sheet.",
    icon: "G",
    iconBg: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  },
  {
    id: "manual",
    name: "Manual orders",
    desc: "Add and reconcile orders manually inside AdControl.",
    icon: "M",
    iconBg: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  },
  {
    id: "meta",
    name: "Meta Ads attribution",
    desc: "Use platform attribution alongside your real revenue.",
    icon: "f",
    iconBg: "bg-[#1877F2]/15 border-[#1877F2]/30 text-blue-300",
  },
];

const inputCls =
  "w-full h-11 px-3.5 bg-[#050816] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-600";
const labelCls =
  "text-[11px] uppercase tracking-wider text-zinc-500 block mb-2";

export default function CreateProjectWizard({
  open,
  onClose,
  onCreated,
}: Props) {
  const [step, setStep] = useState(0);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [niche, setNiche] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("UTC");

  // Step 2
  const [businessManager, setBusinessManager] = useState("");
  const [adAccount, setAdAccount] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [trafficSource, setTrafficSource] = useState("");
  const [projectType, setProjectType] = useState("ecommerce");

  // Step 3
  const [revenueGoal, setRevenueGoal] = useState("");
  const [adBudget, setAdBudget] = useState("");
  const [targetRoas, setTargetRoas] = useState("");
  const [targetCpa, setTargetCpa] = useState("");

  // Step 4
  const [sources, setSources] = useState<Record<string, boolean>>({
    shopify: false,
    sheets: false,
    manual: false,
    meta: false,
  });

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setStep(0);
    setName("");
    setDescription("");
    setNiche("");
    setCurrency("USD");
    setTimezone("UTC");
    setBusinessManager("");
    setAdAccount("");
    setWebsiteUrl("");
    setTrafficSource("");
    setProjectType("ecommerce");
    setRevenueGoal("");
    setAdBudget("");
    setTargetRoas("");
    setTargetCpa("");
    setSources({ shopify: false, sheets: false, manual: false, meta: false });
    setError("");
  }

  function close() {
    if (creating) return;
    reset();
    onClose();
  }

  function canContinue(): boolean {
    if (step === 0) return name.trim().length > 0;
    return true;
  }

  function toNumber(s: string): number {
    const n = parseFloat(s.replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  }

  async function handleCreate() {
    try {
      setCreating(true);
      setError("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }
      if (!session?.user) {
        throw new Error("User not found. Please login again.");
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: session.user.id,
          name: name.trim(),
          description: description.trim(),
          currency,
          timezone,
          monthly_revenue_goal: toNumber(revenueGoal),
          monthly_ad_budget: toNumber(adBudget),
          target_roas: toNumber(targetRoas),
          target_cpa: toNumber(targetCpa),
        })
        .select()
        .single();

      if (projectError) {
        throw new Error(projectError.message);
      }

      const { error: settingsError } = await supabase
        .from("project_settings")
        .insert({ project_id: project.id });

      if (settingsError) {
        throw new Error(settingsError.message);
      }

      reset();
      onClose();
      onCreated();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create project.";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#0B1020] border border-[#1B2238] rounded-3xl flex flex-col max-h-[90vh] overflow-hidden"
      >

        <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-[#1B2238]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-1">
              New project
            </p>
            <h2 className="text-xl font-semibold">
              Create your workspace
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="w-9 h-9 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B2238] flex items-center justify-center transition"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-7 pt-6 pb-2">
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={
                      done
                        ? "w-7 h-7 rounded-full bg-[#6D5EF8] border border-[#6D5EF8] text-white flex items-center justify-center text-xs font-semibold shrink-0"
                        : active
                        ? "w-7 h-7 rounded-full bg-[#6D5EF8]/20 border border-[#6D5EF8] text-white flex items-center justify-center text-xs font-semibold shrink-0"
                        : "w-7 h-7 rounded-full bg-transparent border border-[#1B2238] text-zinc-500 flex items-center justify-center text-xs font-semibold shrink-0"
                    }
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <span
                    className={
                      active
                        ? "text-xs text-white hidden sm:inline"
                        : "text-xs text-zinc-500 hidden sm:inline"
                    }
                  >
                    {label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={
                        done
                          ? "flex-1 h-px bg-[#6D5EF8]"
                          : "flex-1 h-px bg-[#1B2238]"
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label className={labelCls}>Project name</label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Store"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of this workspace"
                  rows={3}
                  className="w-full px-3.5 py-3 bg-[#050816] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Business niche / industry</label>
                  <input
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="e.g. Fashion ecommerce"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={inputCls}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className={labelCls}>Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className={inputCls}
                  >
                    {TIMEZONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 border border-[#1B2238] rounded-2xl p-5 bg-black/30">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#1877F2]/15 border border-[#1877F2]/30 text-blue-300 flex items-center justify-center font-bold shrink-0">
                    f
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold">
                      Connect via Meta Business
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 mb-3 leading-relaxed">
                      Grant access to your Ad Accounts, Campaigns and attribution data.
                    </p>
                    <button
                      disabled
                      className="text-xs font-medium px-4 py-2 rounded-lg border border-[#1B2238] text-zinc-500 cursor-not-allowed"
                    >
                      Connect with Facebook
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Business Manager</label>
                  <input
                    type="text"
                    value={businessManager}
                    onChange={(e) => setBusinessManager(e.target.value)}
                    placeholder="Coming with Meta connection"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ad Account</label>
                  <input
                    type="text"
                    value={adAccount}
                    onChange={(e) => setAdAccount(e.target.value)}
                    placeholder="Coming with Meta connection"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Website URL</label>
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Primary traffic source</label>
                <input
                  type="text"
                  value={trafficSource}
                  onChange={(e) => setTrafficSource(e.target.value)}
                  placeholder="e.g. Meta Ads"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Project type</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PROJECT_TYPES.map((t) => {
                    const active = projectType === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setProjectType(t.value)}
                        className={
                          active
                            ? "h-11 px-3 rounded-xl border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white text-sm transition"
                            : "h-11 px-3 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-zinc-300 text-sm transition"
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Monthly revenue goal</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={revenueGoal}
                      onChange={(e) => setRevenueGoal(e.target.value)}
                      placeholder="0"
                      className={inputCls + " pl-14"}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Monthly ad budget</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={adBudget}
                      onChange={(e) => setAdBudget(e.target.value)}
                      placeholder="0"
                      className={inputCls + " pl-14"}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Target ROAS</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={targetRoas}
                    onChange={(e) => setTargetRoas(e.target.value)}
                    placeholder="e.g. 3.0"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Target CPA</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={targetCpa}
                      onChange={(e) => setTargetCpa(e.target.value)}
                      placeholder="0"
                      className={inputCls + " pl-14"}
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                You can adjust these later in Business Control Center.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Select sources you plan to use. Real connections will become available later.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DATA_SOURCES.map((ds) => {
                  const active = sources[ds.id];
                  return (
                    <button
                      key={ds.id}
                      onClick={() =>
                        setSources((s) => ({ ...s, [ds.id]: !s[ds.id] }))
                      }
                      className={
                        active
                          ? "text-left border border-[#6D5EF8] bg-[#6D5EF8]/10 rounded-2xl p-4 transition"
                          : "text-left border border-[#1B2238] hover:border-zinc-700 rounded-2xl p-4 transition"
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold shrink-0 ${ds.iconBg}`}
                        >
                          {ds.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">
                              {ds.name}
                            </p>
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 border border-[#1B2238] px-1.5 py-0.5 rounded">
                              Placeholder
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                            {ds.desc}
                          </p>
                        </div>
                        <div
                          className={
                            active
                              ? "w-5 h-5 rounded-full bg-[#6D5EF8] border border-[#6D5EF8] flex items-center justify-center text-white text-[11px] shrink-0"
                              : "w-5 h-5 rounded-full border border-[#1B2238] shrink-0"
                          }
                        >
                          {active ? "✓" : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {error && (
          <div className="px-7 pt-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="px-7 py-5 border-t border-[#1B2238] flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Step {step + 1} of {STEPS.length}
          </p>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                disabled={creating}
                className="h-11 px-5 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-300 transition disabled:opacity-50"
              >
                Back
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canContinue()}
                className="h-11 px-6 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="h-11 px-6 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Project"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
