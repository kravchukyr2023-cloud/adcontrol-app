"use client";

import { useState } from "react";
import { useShopifyStatus } from "@/hooks/use-shopify-status";
import { emitMetaSyncCompleted } from "@/lib/meta/events";

type SyncResponse = {
  ok?: boolean;
  total_orders?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: Array<{ orderId: string; reason: string }>;
  truncated?: boolean;
  attribution?: { matched?: number } | null;
  message?: string;
  error?: string;
};

type Banner = { kind: "success"; text: string } | { kind: "error"; text: string };

const statusStyles = {
  available: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  warning: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  error: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  placeholder: "text-zinc-400 border-[#1B2238] bg-black/30",
} as const;

type DerivedState =
  | "loading"
  | "not_connected"
  | "connected"
  | "error";

export default function ShopifyCard({
  projectId,
  projectName,
}: {
  projectId: string | null;
  projectName?: string | null;
}) {
  const { loading, status, error, refresh } = useShopifyStatus(projectId);

  const state: DerivedState = (() => {
    if (loading || !status) return "loading";
    if (status.status === "error") return "error";
    if (status.connected && status.status === "active") return "connected";
    return "not_connected";
  })();

  return (
    <div className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020] flex flex-col">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-start gap-4">
          <ShopifyIcon />
          <div>
            <h2 className="text-lg font-semibold text-white">Shopify</h2>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              Connect your Shopify store to sync real orders and revenue for{" "}
              {projectName ? (
                <span className="text-white">{projectName}</span>
              ) : (
                "this project"
              )}
              .
            </p>
          </div>
        </div>
        <StatusBadge state={state} />
      </div>

      {error && (
        <div className="mb-4 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {!projectId && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
          Select or create a project before connecting Shopify.
        </div>
      )}

      {projectId && state === "loading" && (
        <p className="text-sm text-zinc-500 flex items-center gap-2">
          <Spinner /> Loading Shopify status…
        </p>
      )}

      {projectId && state === "not_connected" && (
        <NotConnectedState projectId={projectId} onConnected={refresh} />
      )}

      {projectId && state === "connected" && status && (
        <ConnectedState
          projectId={projectId}
          shopName={status.shop_name}
          shopUrl={status.shop_url}
          lastSyncAt={
            status.last_successful_sync_at ?? status.last_sync_at
          }
          onChanged={refresh}
        />
      )}

      {projectId && state === "error" && status && (
        <ErrorState
          projectId={projectId}
          shopName={status.shop_name}
          shopUrl={status.shop_url}
          lastError={status.last_error}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: DerivedState }) {
  if (state === "loading") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.placeholder}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
        Loading
      </span>
    );
  }
  if (state === "not_connected") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.placeholder}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
        Not connected
      </span>
    );
  }
  if (state === "connected") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.available}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Connected
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.error}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
      Error
    </span>
  );
}

function NotConnectedState({
  projectId,
  onConnected,
}: {
  projectId: string;
  onConnected: () => void;
}) {
  const [shopUrl, setShopUrl] = useState("");
  const [token, setToken] = useState("");
  const [working, setWorking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  async function handleConnect() {
    setSubmitError(null);
    if (!shopUrl.trim() || !token.trim()) {
      setSubmitError("Please enter both shop URL and access token.");
      return;
    }
    setWorking(true);
    try {
      const resp = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          shop_url: shopUrl.trim(),
          access_token: token.trim(),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        shop_name?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setSubmitError(data.error ?? `Connection failed (${resp.status})`);
        setWorking(false);
        return;
      }
      onConnected();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="shopify-url"
            className="block text-xs uppercase tracking-wider text-zinc-500 mb-1"
          >
            Shop URL
          </label>
          <input
            id="shopify-url"
            type="text"
            value={shopUrl}
            onChange={(e) => setShopUrl(e.target.value)}
            placeholder="yourstore.myshopify.com"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-11 px-3 rounded-xl bg-black/40 border border-[#1B2238] text-sm text-white placeholder:text-zinc-600 focus:border-[#6D5EF8] focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="shopify-token"
            className="block text-xs uppercase tracking-wider text-zinc-500 mb-1"
          >
            Admin API access token
          </label>
          <input
            id="shopify-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="shpat_…"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-11 px-3 rounded-xl bg-black/40 border border-[#1B2238] text-sm text-white placeholder:text-zinc-600 focus:border-[#6D5EF8] focus:outline-none font-mono"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConnect}
          disabled={working}
          className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition inline-flex items-center gap-2"
        >
          {working ? (
            <>
              <Spinner />
              Connecting…
            </>
          ) : (
            "Connect Shopify"
          )}
        </button>
      </div>

      {submitError && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-sm text-rose-200">
          {submitError}
        </div>
      )}

      <HowToConnect open={helpOpen} onToggle={() => setHelpOpen((v) => !v)} />
    </div>
  );
}

function ConnectedState({
  projectId,
  shopName,
  shopUrl,
  lastSyncAt,
  onChanged,
}: {
  projectId: string;
  shopName: string | null;
  shopUrl: string | null;
  lastSyncAt: string | null;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  async function handleSync() {
    if (syncing || working) return;
    setBanner(null);
    setTokenExpired(false);
    setSyncing(true);
    try {
      const resp = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = (await resp.json().catch(() => ({}))) as SyncResponse;

      if (resp.status === 401) {
        setTokenExpired(true);
        setBanner({
          kind: "error",
          text: data.error ?? "Connection expired. Please reconnect.",
        });
        return;
      }
      if (!resp.ok) {
        setBanner({
          kind: "error",
          text: data.error ?? `Sync failed (${resp.status})`,
        });
        return;
      }

      setBanner({
        kind: data.ok === false ? "error" : "success",
        text: formatSyncResult(data),
      });
      // Let /sales and /dashboard re-fetch (same event Google uses).
      emitMetaSyncCompleted();
    } catch (err) {
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSyncing(false);
      // Refresh status so last_synced_at / error reflect this run.
      onChanged();
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Shopify from this project?")) return;
    setWorking(true);
    await fetch("/api/shopify/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    }).catch(() => null);
    setWorking(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="border border-[#1B2238] rounded-xl bg-black/30 px-4 py-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Connected store
        </div>
        <div className="text-sm font-semibold text-white">
          {shopName ?? "Untitled store"}
        </div>
        {shopUrl && (
          <div className="text-xs text-zinc-500 mt-1 font-mono">{shopUrl}</div>
        )}
        <div className="text-xs text-zinc-500 mt-2">
          Last synced: {lastSyncAt ? formatDate(lastSyncAt) : "never"}
        </div>
      </div>

      {banner && (
        <div
          className={
            banner.kind === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-start justify-between gap-3"
              : "border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-start justify-between gap-3"
          }
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-current opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {tokenExpired ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={working}
            className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition disabled:opacity-50"
          >
            Reconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || working}
            className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition inline-flex items-center gap-2"
          >
            {syncing ? (
              <>
                <Spinner />
                Syncing…
              </>
            ) : (
              "Sync now"
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={working || syncing}
          className="h-11 px-5 rounded-xl border border-rose-500/40 hover:border-rose-500/70 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 text-sm transition disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function formatSyncResult(data: SyncResponse): string {
  if (data.message && (data.total_orders ?? 0) === 0) {
    return data.message;
  }

  const inserted = data.inserted ?? 0;
  const updated = data.updated ?? 0;
  const skipped = data.skipped ?? 0;
  const matched = data.attribution?.matched ?? 0;
  const total = inserted + updated;

  const parts = [
    `Synced ${total} orders (${inserted} new, ${updated} updated, ${skipped} skipped)`,
  ];
  if (matched > 0) parts.push(`${matched} matched to Meta`);
  if (data.truncated && data.message) parts.push(data.message);

  if (skipped > 0 && data.errors && data.errors.length > 0) {
    const sample = data.errors
      .slice(0, 3)
      .map((e) => `order ${e.orderId}: ${e.reason}`)
      .join("; ");
    parts.push(
      `First skipped: ${sample}${
        data.errors.length > 3 ? ` (+${data.errors.length - 3} more)` : ""
      }`
    );
  }

  return parts.join(" — ");
}

function ErrorState({
  projectId,
  shopName,
  shopUrl,
  lastError,
  onChanged,
}: {
  projectId: string;
  shopName: string | null;
  shopUrl: string | null;
  lastError: string | null;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);

  async function handleReconnect() {
    setWorking(true);
    await fetch("/api/shopify/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    }).catch(() => null);
    setWorking(false);
    onChanged();
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Shopify from this project?")) return;
    setWorking(true);
    await fetch("/api/shopify/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    }).catch(() => null);
    setWorking(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      {(shopName || shopUrl) && (
        <div className="border border-[#1B2238] rounded-xl bg-black/30 px-4 py-3 text-xs text-zinc-500">
          Store:{" "}
          <span className="text-zinc-200">
            {shopName ?? shopUrl ?? "—"}
          </span>
        </div>
      )}

      <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-sm text-rose-200">
        {lastError ?? "Shopify connection is in error state."}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleReconnect}
          disabled={working}
          className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition disabled:opacity-50"
        >
          Reconnect
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={working}
          className="h-11 px-5 rounded-xl border border-rose-500/40 hover:border-rose-500/70 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 text-sm transition disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function HowToConnect({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const steps: string[] = [
    "Shopify Admin → Settings → Apps and sales channels → Develop apps.",
    'Click "Create an app" and name it (e.g. "AdControl").',
    "Configure Admin API scopes: read_orders, read_products, read_customers.",
    "Install the app.",
    'Reveal and copy the Admin API access token (starts with "shpat_").',
    "Paste your shop URL and the token above, then click Connect.",
  ];

  return (
    <div className="mt-2 border-t border-[#1B2238] pt-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-semibold text-white hover:text-[#a99cff] transition"
        aria-expanded={open}
      >
        <span
          aria-hidden
          className={`inline-block w-3 h-3 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
        How to create a Custom App
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <ol className="space-y-1.5 text-xs text-zinc-300 list-none">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1B2238] text-[10px] text-zinc-300 shrink-0">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-zinc-500 border border-[#1B2238] rounded-lg px-3 py-2 bg-black/20">
            For development/testing. Public OAuth coming for production.
          </p>
        </div>
      )}
    </div>
  );
}

function ShopifyIcon() {
  return (
    <div className="w-11 h-11 rounded-xl border bg-emerald-500/15 border-emerald-500/30 text-emerald-300 flex items-center justify-center font-bold">
      S
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin"
      aria-hidden="true"
    />
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
