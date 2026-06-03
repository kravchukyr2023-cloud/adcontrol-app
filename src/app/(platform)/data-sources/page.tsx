"use client";

import { useEffect, useRef, useState } from "react";
import { FeatureId } from "@/config/plans";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useActiveProject } from "@/hooks/use-active-project";
import { useProjectMetaConnection } from "@/hooks/use-project-meta-connection";
import { useMetaOverview } from "@/hooks/use-meta-overview";
import { canAccess, requiredPlanFor } from "@/lib/billing/feature-access";
import { emitMetaConnectionChanged } from "@/lib/meta/events";

import ConnectMetaButton from "@/components/meta/connect-meta-button";
import DisconnectMetaModal from "@/components/meta/disconnect-meta-modal";
import ProjectBmSection from "@/components/meta/project-bm-section";
import AddBmModal from "@/components/meta/add-bm-modal";

type SecondarySource = {
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  feature: FeatureId;
};

const SECONDARY_SOURCES: SecondarySource[] = [
  {
    name: "Manual Orders",
    description: "Add and reconcile orders manually inside AdControl.",
    icon: "M",
    iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    feature: "manual_orders",
  },
  {
    name: "Google Sheets",
    description: "Pull orders or attribution from your operational sheet.",
    icon: "G",
    iconBg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
    feature: "google_sheets",
  },
  {
    name: "Shopify",
    description:
      "Sync real orders, revenue and AOV from your store as the source of truth.",
    icon: "S",
    iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    feature: "shopify",
  },
];

const statusStyles: Record<string, string> = {
  available: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  warning: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  placeholder: "text-zinc-400 border-[#1B2238] bg-black/30",
  locked: "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

export default function DataSourcesPage() {
  const { plan, loading: entLoading } = useEntitlements();
  const { project } = useActiveProject();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Data Sources
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Connect Meta Ads, Shopify, Google Sheets and manual orders as data
          sources for spend, revenue and attribution.
        </p>
      </div>

      <MetaAdsCard
        projectId={project?.id ?? null}
        projectName={project?.name ?? null}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECONDARY_SOURCES.map((s) => {
          let status: keyof typeof statusStyles = "placeholder";
          let statusLabel = "Coming soon";
          let actionLabel: string | null = null;

          const hasAccess = !entLoading && canAccess(s.feature, plan);
          if (hasAccess) {
            status = "available";
            statusLabel = "Available";
            actionLabel = "Connect";
          } else {
            const requires = requiredPlanFor(s.feature);
            status = "locked";
            statusLabel = `Requires ${requires?.name ?? "upgrade"}`;
            actionLabel = "Upgrade Plan";
          }

          return (
            <div
              key={s.name}
              className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020] flex flex-col"
            >
              <div className="flex items-start justify-between mb-5">
                <div
                  className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold ${s.iconBg}`}
                >
                  {s.icon}
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full ${statusStyles[status]}`}
                >
                  {statusLabel}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">
                {s.name}
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed flex-1 mb-5">
                {s.description}
              </p>
              <button
                disabled
                title={
                  status === "locked"
                    ? `Requires ${requiredPlanFor(s.feature)?.name ?? "upgrade"}`
                    : "Connector coming in a future sprint"
                }
                className="h-10 rounded-lg border border-[#1B2238] text-sm text-zinc-400 cursor-not-allowed"
              >
                {actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetaAdsCard({
  projectId,
  projectName,
}: {
  projectId: string | null;
  projectName: string | null;
}) {
  const meta = useProjectMetaConnection(projectId);
  const overview = useMetaOverview(projectId);
  const { plan, limits } = useEntitlements();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [addBmOpen, setAddBmOpen] = useState(false);

  // Guard for the auto-open effect below. Tracks whether we already
  // auto-opened AddBmModal during the current "no_binding_yet" episode.
  // Reset when status leaves no_binding_yet so a future re-entry (e.g. user
  // disconnects then reconnects) can auto-open again.
  const autoOpenedAddBmRef = useRef(false);

  // Auto-open AddBmModal on transition INTO no_binding_yet (the post-OAuth
  // "we know who you are on Facebook, now pick a BM for this project" moment).
  //
  // Protection:
  //   - Fires only when meta.status transitions to "no_binding_yet" — not on
  //     every render (gate on `!autoOpenedAddBmRef.current`).
  //   - After the user closes the modal, ref stays `true` for as long as the
  //     status remains no_binding_yet → no repeat open on subsequent renders.
  //   - Ref resets to `false` once status leaves no_binding_yet (becomes
  //     "connected" after binding, or "no_oauth" after disconnect). A fresh
  //     OAuth that lands back in no_binding_yet then triggers a new auto-open.
  useEffect(() => {
    if (meta.status === "no_binding_yet") {
      if (autoOpenedAddBmRef.current) return;
      autoOpenedAddBmRef.current = true;
      setAddBmOpen(true);
      return;
    }
    if (meta.status === "connected" || meta.status === "no_oauth") {
      autoOpenedAddBmRef.current = false;
    }
  }, [meta.status]);

  // Onboarding highlight after fresh project creation (router.push with ?focus=meta).
  // Auto-scrolls the card into view + applies a soft ring for ~6s.
  // Reads from window.location.search directly so the static prerender of
  // /data-sources isn't broken by useSearchParams.
  const cardRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("focus") !== "meta") return;

    let cancelled = false;
    // setState via microtask to satisfy react-hooks/set-state-in-effect.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setHighlight(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const timer = setTimeout(() => {
      if (!cancelled) setHighlight(false);
    }, 6000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const isConnected = meta.status === "connected";
  const isExpired = meta.status === "expired";
  const isDisconnected = meta.status === "disconnected";
  // Global OAuth exists, but this project has no project_meta_business_managers
  // row yet. UI must offer "pick a BM", NOT "Connect with Facebook".
  const isNoBindingYet = meta.status === "no_binding_yet";
  const hasAnyBm = overview.business_managers.length > 0;

  // Per-project usage for THIS project
  const bmsInProject = overview.business_managers.length;
  const aasInProject = overview.business_managers.reduce(
    (sum, bm) => sum + bm.ad_accounts.length,
    0
  );
  const bmsOverLimit = bmsInProject > limits.businessManagersPerProject;
  const aasOverLimit = aasInProject > limits.adAccountsPerProject;
  const atBmLimit = bmsInProject >= limits.businessManagersPerProject;

  async function handleDisconnect() {
    const resp = await fetch("/api/meta/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || "Failed to disconnect");
    }
    emitMetaConnectionChanged();
    overview.refresh();
  }

  function badge(): { label: string; cls: string } {
    if (meta.status === "loading") {
      return { label: "Loading…", cls: statusStyles.placeholder };
    }
    if (isExpired) return { label: "Token expired", cls: statusStyles.warning };
    if (isDisconnected) {
      return { label: "Disconnected", cls: statusStyles.placeholder };
    }
    if (isConnected && hasAnyBm) {
      return { label: "Connected", cls: statusStyles.available };
    }
    if (isConnected) {
      return { label: "Connected — add BM", cls: statusStyles.warning };
    }
    if (isNoBindingYet) {
      return { label: "Connected — pick BM", cls: statusStyles.warning };
    }
    return { label: "Not connected", cls: statusStyles.placeholder };
  }
  const b = badge();

  // Onboarding hint — project-scoped, derived from state. No setState, no
  // timer; advances automatically as user progresses. Disappears entirely
  // once the project has at least one selected Ad Account.
  let onboardingHint: { title: string; body: string } | null = null;
  if (projectId && isConnected) {
    if (bmsInProject === 0) {
      onboardingHint = {
        title: "Next step: Add a Business Manager",
        body: "Click + Add Business Manager below to pick from your connected Meta account.",
      };
    } else if (aasInProject === 0) {
      onboardingHint = {
        title: "Next step: Select Ad Accounts for this project",
        body: "Toggle one or more Ad Accounts inside the Business Manager section below to wire this project.",
      };
    }
  }

  return (
    <div className="space-y-3">
      {highlight && (
        <div className="border border-[#6D5EF8]/40 bg-[#6D5EF8]/10 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#6D5EF8]/20 border border-[#6D5EF8]/50 text-[#a99cff] flex items-center justify-center text-xs font-semibold shrink-0">
            →
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Next step: Connect Meta Ads
              {projectName ? (
                <> for <span className="text-[#a99cff]">{projectName}</span></>
              ) : null}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              This project starts with no Meta wiring — your other projects
              are unaffected.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHighlight(false)}
            aria-label="Dismiss"
            className="w-7 h-7 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B2238] flex items-center justify-center transition shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Persistent onboarding hint — advances with project state. */}
      {onboardingHint && !highlight && (
        <div className="border border-[#6D5EF8]/30 bg-[#6D5EF8]/5 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#6D5EF8]/15 border border-[#6D5EF8]/40 text-[#a99cff] flex items-center justify-center text-xs font-semibold shrink-0">
            →
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              {onboardingHint.title}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {onboardingHint.body}
            </p>
          </div>
        </div>
      )}

      <div
        ref={cardRef}
        className={
          highlight
            ? "border border-[#6D5EF8]/60 rounded-2xl p-6 bg-[#0B1020] flex flex-col ring-2 ring-[#6D5EF8]/40 ring-offset-2 ring-offset-[#050816] shadow-[0_0_40px_rgba(109,94,248,0.25)] transition-all duration-500"
            : "border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020] flex flex-col transition-all duration-500"
        }
      >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl border bg-[#1877F2]/15 border-[#1877F2]/30 text-blue-300 flex items-center justify-center font-bold">
            f
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Meta Ads</h2>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              Add one or more Business Managers and select Ad Accounts for{" "}
              {projectName ? (
                <span className="text-white">{projectName}</span>
              ) : (
                "this project"
              )}
              .
            </p>
          </div>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 ${b.cls}`}
        >
          {b.label}
        </span>
      </div>

      {!projectId && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
          Select or create a project before wiring Meta resources.
        </div>
      )}

      {projectId && meta.status === "loading" && (
        <p className="text-sm text-zinc-500">Loading Meta status…</p>
      )}

      {projectId && meta.status === "no_oauth" && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Authorize AdControl to read your Business Managers and owned Ad
            Accounts.
          </p>
          <ConnectMetaButton />
        </div>
      )}

      {/*
        Global OAuth exists, but this project still has no binding. This is
        the post-OAuth "pick a BM for this project" CTA — it must NOT show
        Connect-with-Facebook again, because the user is already connected.
        The button reuses setAddBmOpen → AddBmModal (which lists BMs from
        the existing user-global connection via /api/meta/bms).
      */}
      {projectId && isNoBindingYet && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Facebook is connected. Pick a Business Manager and Ad Accounts
            for {projectName ? <span className="text-white">{projectName}</span> : "this project"}.
          </p>
          <button
            type="button"
            onClick={() => setAddBmOpen(true)}
            className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition inline-flex items-center justify-center"
          >
            Pick Business Manager →
          </button>
        </div>
      )}

      {projectId && (isExpired || isDisconnected) && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-sm text-zinc-400">
            {isExpired
              ? "Meta token expired. Reconnect to restore access."
              : "Meta disconnected. Reconnect to resume."}
          </p>
          <ConnectMetaButton label="Reconnect Meta" />
        </div>
      )}

      {projectId && isConnected && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 border border-[#1B2238] rounded-xl bg-black/30 px-4 py-3">
            <div>
              Account:{" "}
              <span className="text-zinc-200">
                {meta.metaUserName ?? "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDisconnectOpen(true)}
              className="h-8 px-3 rounded-lg border border-rose-500/40 hover:border-rose-500/70 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 text-xs transition"
            >
              Disconnect
            </button>
          </div>

          {/* Per-project quota row */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div
              className={`border rounded-xl px-4 py-3 ${
                bmsOverLimit
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-[#1B2238] bg-black/30"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Business Managers in this project
              </p>
              <p
                className={`text-sm font-semibold ${
                  bmsOverLimit ? "text-amber-300" : "text-white"
                }`}
              >
                {bmsInProject} / {limits.businessManagersPerProject}
              </p>
            </div>
            <div
              className={`border rounded-xl px-4 py-3 ${
                aasOverLimit
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-[#1B2238] bg-black/30"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Ad Accounts in this project
              </p>
              <p
                className={`text-sm font-semibold ${
                  aasOverLimit ? "text-amber-300" : "text-white"
                }`}
              >
                {aasInProject} / {limits.adAccountsPerProject}
              </p>
            </div>
          </div>

          {(bmsOverLimit || aasOverLimit) && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 text-xs text-amber-200">
              This project exceeds {plan.name} plan limits. Existing
              selections remain active; new additions are blocked. Upgrade plan
              or remove items to add more.
            </div>
          )}

          {overview.business_managers.map((bm) => (
            <ProjectBmSection
              key={bm.id}
              bm={bm}
              projectId={projectId}
              atAaLimit={aasInProject >= limits.adAccountsPerProject}
              aaLimit={limits.adAccountsPerProject}
              planName={plan.name}
              onChanged={() => overview.refresh()}
            />
          ))}

          {!hasAnyBm && (
            <div className="border border-[#1B2238] rounded-xl bg-black/20 px-4 py-3 text-xs text-zinc-500">
              No Business Manager added yet. Click below to add one.
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                // Defensive guard: even if React state lags, hard-block at limit.
                if (atBmLimit) return;
                setAddBmOpen(true);
              }}
              disabled={atBmLimit}
              className="h-11 px-5 rounded-xl border border-dashed border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-200 transition w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {hasAnyBm
                ? "+ Add another Business Manager"
                : "+ Add Business Manager"}
            </button>
            {atBmLimit && (
              <p className="text-xs text-zinc-500">
                Business Manager limit reached for this project. Your{" "}
                {plan.name} plan allows{" "}
                {limits.businessManagersPerProject} BM
                {limits.businessManagersPerProject === 1 ? "" : "s"} per project.
              </p>
            )}
          </div>
        </div>
      )}

      <DisconnectMetaModal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={handleDisconnect}
      />

      {addBmOpen && projectId && (
        <AddBmModal
          projectId={projectId}
          existingBmIds={overview.business_managers
            .map((b) => b.meta_bm_id)
            .filter((x): x is string => !!x)}
          onClose={() => setAddBmOpen(false)}
          onAdded={() => {
            setAddBmOpen(false);
            overview.refresh();
            // Tell useProjectMetaConnection to re-query bindings — the new
            // project_meta_business_managers row transitions status from
            // "no_binding_yet" to "connected".
            emitMetaConnectionChanged();
          }}
        />
      )}
      </div>
    </div>
  );
}

