"use client";

import { useEffect, useState } from "react";
import { FeatureId } from "@/config/plans";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useActiveProject } from "@/hooks/use-active-project";
import { useMetaConnection } from "@/hooks/use-meta-connection";
import { canAccess, requiredPlanFor } from "@/lib/billing/feature-access";
import { emitMetaConnectionChanged } from "@/lib/meta/events";

import ConnectMetaButton from "@/components/meta/connect-meta-button";
import MetaConnectionCard from "@/components/meta/meta-connection-card";
import BmSelector, { MetaBmOption } from "@/components/meta/bm-selector";
import AdAccountSelector, {
  MetaAdAccountOption,
} from "@/components/meta/ad-account-selector";
import DisconnectMetaModal from "@/components/meta/disconnect-meta-modal";

type SourceCard = {
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  feature?: FeatureId;
  note?: string;
};

const SOURCES: SourceCard[] = [
  {
    name: "Meta Ads",
    description:
      "Campaigns, ad sets, creatives and spend from your Business Manager.",
    icon: "f",
    iconBg: "bg-[#1877F2]/15 border-[#1877F2]/30 text-blue-300",
    note: "Manage below",
  },
  {
    name: "Manual Orders",
    description:
      "Add and reconcile orders manually inside AdControl.",
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
  available:
    "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  placeholder: "text-zinc-400 border-[#1B2238] bg-black/30",
  locked: "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

export default function DataSourcesPage() {
  const { plan, loading: entLoading } = useEntitlements();
  const { project } = useActiveProject();
  const meta = useMetaConnection();

  const [bms, setBMs] = useState<MetaBmOption[]>([]);
  const [bmsLoading, setBmsLoading] = useState(false);
  const [bmsError, setBmsError] = useState<string | null>(null);
  const [selectedBmId, setSelectedBmId] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<MetaAdAccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const isConnected = meta.status === "connected";

  // Fetch BMs when connected
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isConnected) {
        if (cancelled) return;
        setBMs([]);
        setSelectedBmId(null);
        return;
      }

      setBmsLoading(true);
      setBmsError(null);
      try {
        const resp = await fetch("/api/meta/bms", { cache: "no-store" });
        const data = await resp.json();
        if (cancelled) return;
        if (data.error) setBmsError(String(data.error));
        const list = (data.bms ?? []) as MetaBmOption[];
        setBMs(list);
        if (list.length > 0 && !selectedBmId) {
          setSelectedBmId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load BMs";
        setBmsError(msg);
      } finally {
        if (!cancelled) setBmsLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, meta.connectionId]);

  // Fetch Ad Accounts when BM changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isConnected || !selectedBmId) {
        if (cancelled) return;
        setAccounts([]);
        setSelectedAccountId(null);
        return;
      }

      setAccountsLoading(true);
      setAccountsError(null);
      try {
        const resp = await fetch(
          `/api/meta/ad-accounts?bmId=${encodeURIComponent(selectedBmId)}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (data.error) setAccountsError(String(data.error));
        const list = (data.accounts ?? []) as MetaAdAccountOption[];
        setAccounts(list);
        if (list.length > 0) {
          setSelectedAccountId(list[0].id);
        } else {
          setSelectedAccountId(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load Ad Accounts";
        setAccountsError(msg);
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [isConnected, selectedBmId]);

  async function handleSave() {
    if (!project) {
      setSaveError("No active project. Open a project first.");
      return;
    }
    if (!selectedBmId || !selectedAccountId) {
      setSaveError("Select both Business Manager and Ad Account.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const resp = await fetch("/api/meta/wire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          meta_bm_id: selectedBmId,
          meta_ad_account_id: selectedAccountId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Failed to save");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    const resp = await fetch("/api/meta/disconnect", { method: "POST" });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || "Failed to disconnect");
    }
    emitMetaConnectionChanged();
  }

  function handleReconnect() {
    window.open("/api/meta/connect", "metaOAuth", "width=600,height=720");
  }

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Data Sources
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Connect Meta Ads, Shopify, Google Sheets and manual orders as data sources for spend, revenue and attribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SOURCES.map((s) => {
          let status: "available" | "placeholder" | "locked" = "placeholder";
          let statusLabel = s.note ?? "Coming in Sprint 3";
          let actionLabel: string | null = null;

          if (s.name === "Meta Ads") {
            if (isConnected) {
              status = "available";
              statusLabel = "Connected";
            } else if (meta.status === "expired") {
              status = "locked";
              statusLabel = "Expired";
            } else {
              status = "placeholder";
              statusLabel = "Manage below";
            }
          } else if (s.feature) {
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

              {actionLabel && (
                <button
                  disabled
                  title={
                    status === "locked" && s.feature
                      ? `Requires ${requiredPlanFor(s.feature)?.name ?? "upgrade"}`
                      : "Coming in Sprint 3"
                  }
                  className="h-10 rounded-lg border border-[#1B2238] text-sm text-zinc-400 cursor-not-allowed"
                >
                  {actionLabel}
                </button>
              )}

              {!actionLabel && s.name !== "Meta Ads" && (
                <p className="text-xs text-zinc-500">
                  Managed automatically.
                </p>
              )}

              {s.name === "Meta Ads" && (
                <p className="text-xs text-zinc-500">
                  Manage below in the Meta Integration section.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Meta Integration section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Meta Integration</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Connect your Meta Business account and bind a Business Manager + active Ad Account to{" "}
            {project ? (
              <span className="text-white">{project.name}</span>
            ) : (
              <span className="text-rose-300">no active project</span>
            )}
            .
          </p>
        </div>

        {!project && (
          <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
            Select or create a project before wiring Meta resources.
          </div>
        )}

        {meta.status === "loading" && (
          <p className="text-sm text-zinc-500">Loading Meta status…</p>
        )}

        {meta.status === "none" && (
          <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold mb-1">
                Not connected to Meta
              </h3>
              <p className="text-xs text-zinc-500">
                Click Connect to authorize AdControl to read your Meta Business Managers and owned Ad Accounts.
              </p>
            </div>
            <ConnectMetaButton />
          </div>
        )}

        {(meta.status === "disconnected" || meta.status === "expired") && (
          <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold mb-1">
                {meta.status === "expired" ? "Meta token expired" : "Meta disconnected"}
              </h3>
              <p className="text-xs text-zinc-500">
                Reconnect to restore access.
              </p>
            </div>
            <ConnectMetaButton label="Reconnect Meta" />
          </div>
        )}

        {isConnected && (
          <>
            <MetaConnectionCard
              connection={meta}
              onReconnect={handleReconnect}
              onDisconnect={() => setDisconnectOpen(true)}
            />

            {bmsError && (
              <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
                {bmsError}
              </div>
            )}

            <BmSelector
              bms={bms}
              selectedId={selectedBmId}
              onSelect={setSelectedBmId}
              loading={bmsLoading}
              disabled={saving}
            />

            {accountsError && (
              <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
                {accountsError}
              </div>
            )}

            <AdAccountSelector
              accounts={accounts}
              selectedId={selectedAccountId}
              onSelect={setSelectedAccountId}
              loading={accountsLoading}
              disabled={saving}
              bmSelected={!!selectedBmId}
            />

            <div className="flex flex-col items-end gap-2">
              {saveError && (
                <p className="text-xs text-rose-300">{saveError}</p>
              )}
              {saved && (
                <p className="text-xs text-emerald-400">
                  Saved. Project wired to Meta.
                </p>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  saving ||
                  !project ||
                  !selectedBmId ||
                  !selectedAccountId
                }
                className="h-11 px-6 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Meta wiring"}
              </button>
            </div>
          </>
        )}
      </section>

      <DisconnectMetaModal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={handleDisconnect}
      />

    </div>
  );
}
