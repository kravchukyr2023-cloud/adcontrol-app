"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  emitActiveProjectChange,
  emitActiveProjectUpdated,
  useActiveProject,
  ActiveProject,
} from "@/hooks/use-active-project";

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

export default function SettingsPage() {
  const { project, loading } = useActiveProject();

  if (loading) {
    return (
      <div className="text-sm text-zinc-500">Loading project…</div>
    );
  }

  if (!project) {
    return (
      <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-8 max-w-xl">
        <h2 className="text-lg font-semibold mb-2">
          No active project
        </h2>
        <p className="text-sm text-zinc-400 mb-5">
          Select or create a project to manage its settings.
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return <SettingsForm key={project.id} project={project} />;
}

function SettingsForm({ project }: { project: ActiveProject }) {
  const router = useRouter();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(project.website_url ?? "");
  const [currency, setCurrency] = useState(project.currency);
  const [timezone, setTimezone] = useState(project.timezone);

  const [revenueGoal, setRevenueGoal] = useState(
    String(project.monthly_revenue_goal ?? "")
  );
  const [adBudget, setAdBudget] = useState(
    String(project.monthly_ad_budget ?? "")
  );
  const [targetRoas, setTargetRoas] = useState(
    String(project.target_roas ?? "")
  );
  const [targetCpa, setTargetCpa] = useState(
    String(project.target_cpa ?? "")
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function toNumber(s: string): number {
    const n = parseFloat(s.replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  }

  async function handleSave() {
    try {
      setSaving(true);
      setSaved(false);
      setSaveError("");

      const { error } = await supabase
        .from("projects")
        .update({
          name: name.trim(),
          description: description.trim(),
          website_url: websiteUrl.trim() || null,
          currency,
          timezone,
          monthly_revenue_goal: toNumber(revenueGoal),
          monthly_ad_budget: toNumber(adBudget),
          target_roas: toNumber(targetRoas),
          target_cpa: toNumber(targetCpa),
        })
        .eq("id", project.id);

      if (error) throw new Error(error.message);

      emitActiveProjectUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      setDeleteError("");

      const { error: settingsError } = await supabase
        .from("project_settings")
        .delete()
        .eq("project_id", project.id)
        .select();

      if (settingsError) {
        throw new Error(
          `Failed to delete project_settings: ${settingsError.message}`
        );
      }

      const { data: deletedProjects, error: projectError } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id)
        .select();

      if (projectError) {
        throw new Error(
          `Failed to delete project: ${projectError.message}`
        );
      }

      if (!deletedProjects || deletedProjects.length === 0) {
        throw new Error(
          "Project was not deleted. The projects table needs a DELETE policy. In Supabase → Authentication → Policies → projects, add a policy for DELETE with check: auth.uid() = user_id."
        );
      }

      emitActiveProjectChange(null);
      router.push("/projects");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete project.";
      setDeleteError(message);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Business Control Center
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Edit project configuration. Changes apply to dashboard, UTM generator and targets.
        </p>
      </div>

      <SectionCard
        title="General"
        subtitle="Project identity and primary URL."
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Project name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-3 bg-[#050816] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-600 resize-none"
            />
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
            <p className="text-xs text-zinc-500 mt-2">
              Default base URL for the UTM Generator.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Environment"
        subtitle="Currency and timezone — read everywhere across the platform."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      </SectionCard>

      <SectionCard
        title="Targets"
        subtitle="Monthly business goals — used in dashboard progress and project cards."
      >
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
      </SectionCard>

      <div className="flex flex-col items-end gap-2">
        {saveError && (
          <p className="text-xs text-red-400">{saveError}</p>
        )}
        {saved && (
          <p className="text-xs text-emerald-400">Saved.</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="h-11 px-6 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <SectionCard
        title="Danger Zone"
        subtitle="Permanent actions. Cannot be undone."
        accent="danger"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-white font-medium">
              Delete this project
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Removes the project and its settings. Other projects are untouched.
            </p>
          </div>
          <button
            onClick={() => setDeleteOpen(true)}
            className="h-10 px-5 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-sm font-medium transition"
          >
            Delete Project
          </button>
        </div>
      </SectionCard>

      {deleteOpen && (
        <div
          onClick={() => !deleting && setDeleteOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0B1020] border border-[#1B2238] rounded-3xl p-7"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-300 mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">
              Are you sure you want to delete this project?
            </h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              <span className="text-white">{project.name}</span> and its settings will be removed permanently. This action cannot be undone.
            </p>

            {deleteError && (
              <p className="text-red-400 text-sm mb-4">{deleteError}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-300 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm transition disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: "danger";
}) {
  const borderCls =
    accent === "danger"
      ? "border-rose-500/30"
      : "border-[#1B2238]";

  return (
    <section
      className={`border rounded-2xl bg-[#0B1020] p-6 ${borderCls}`}
    >
      <div className="mb-6">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}
