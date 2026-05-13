"use client";

import { useState } from "react";

const inputCls =
  "w-full h-11 px-3.5 bg-[#050816] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-600";
const labelCls =
  "text-[11px] uppercase tracking-wider text-zinc-500 block mb-2";

const CURRENCIES = ["USD", "EUR", "GBP", "UAH", "PLN"];
const TIMEZONES = [
  "UTC",
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
];
const SYNC_INTERVALS = [
  { value: "manual", label: "Manual" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "1h", label: "Every hour" },
  { value: "6h", label: "Every 6 hours" },
  { value: "24h", label: "Every 24 hours" },
];

export default function SettingsPage() {
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("UTC");
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState("manual");

  const [revenueGoal, setRevenueGoal] = useState("");
  const [adBudget, setAdBudget] = useState("");
  const [targetRoas, setTargetRoas] = useState("");
  const [targetCpa, setTargetCpa] = useState("");

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Business Control Center
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Configure project goals, currency, timezone and sync intervals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
          <h2 className="text-base font-semibold mb-1">
            General Settings
          </h2>
          <p className="text-xs text-zinc-500 mb-6">
            Currency, timezone and sync behavior.
          </p>

          <div className="space-y-5">

            <div>
              <label className={labelCls}>Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputCls}
              >
                {TIMEZONES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-[#1B2238] bg-[#050816]">
              <div>
                <p className="text-sm text-white">Auto-sync</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Pull Meta Ads data on a schedule.
                </p>
              </div>
              <button
                onClick={() => setAutoSync((v) => !v)}
                className={
                  autoSync
                    ? "w-10 h-6 rounded-full bg-[#6D5EF8] relative transition"
                    : "w-10 h-6 rounded-full bg-[#1B2238] relative transition"
                }
                aria-label="Toggle auto-sync"
              >
                <span
                  className={
                    autoSync
                      ? "absolute top-0.5 left-[18px] w-5 h-5 rounded-full bg-white transition"
                      : "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition"
                  }
                />
              </button>
            </div>

            <div>
              <label className={labelCls}>Sync interval</label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                disabled={!autoSync}
                className={inputCls + (autoSync ? "" : " opacity-50")}
              >
                {SYNC_INTERVALS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>

        <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
          <h2 className="text-base font-semibold mb-1">
            Monthly Targets
          </h2>
          <p className="text-xs text-zinc-500 mb-6">
            Revenue, budget and target performance.
          </p>

          <div className="space-y-5">

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
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <button
          disabled
          className="h-11 px-6 rounded-xl bg-[#6D5EF8] text-white font-medium text-sm transition opacity-60 cursor-not-allowed"
        >
          Save Changes
        </button>
        <p className="text-xs text-zinc-500">
          Saving is wired in a later step — values are UI-only for now.
        </p>
      </div>

    </div>
  );
}
