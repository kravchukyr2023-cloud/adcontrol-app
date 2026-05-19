"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { emitMetaConnectionChanged } from "@/lib/meta/events";

type AvailableBm = { id: string; name: string };

type Props = {
  projectId: string;
  /** meta_bm_id strings of BMs already attached to this project (active). */
  existingBmIds: string[];
  onClose: () => void;
  onAdded: () => void;
};

/**
 * Lists all Business Managers visible to the connected Meta account.
 *
 * Two refresh paths:
 *  1. "Refresh from Meta"            — POST /api/meta/bms/refresh
 *     Re-fetches /me/businesses with the existing access token. Pulls in any
 *     BMs that were already granted in a prior consent but not yet cached.
 *     No Facebook OAuth.
 *
 *  2. "Authorize more Business Managers" — popup → /api/meta/connect?mode=reauthorize_bms
 *     Re-opens the Meta consent dialog (same Facebook account) with
 *     auth_type=rerequest so the user can grant access to additional BMs.
 *     After the popup closes successfully, the modal auto-refreshes.
 *     This is NOT "connect another Facebook account" — same Meta user, same
 *     connection, just extended asset access.
 */
export default function AddBmModal({
  projectId,
  existingBmIds,
  onClose,
  onAdded,
}: Props) {
  const { plan } = useEntitlements();
  const [bms, setBMs] = useState<AvailableBm[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [refreshFlash, setRefreshFlash] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [quotaBanner, setQuotaBanner] = useState<{
    limit: number;
    used: number;
  } | null>(null);

  const existingSet = useMemo(() => new Set(existingBmIds), [existingBmIds]);
  // Snapshot of BM ids BEFORE the reauth popup opened. Used to compute
  // whether any NEW BMs appeared after consent.
  const reauthPrevIdsRef = useRef<Set<string> | null>(null);

  const sortByAdded = useCallback(
    (list: AvailableBm[]): AvailableBm[] => {
      const copy = [...list];
      copy.sort((a, b) => {
        const aAdded = existingSet.has(a.id);
        const bAdded = existingSet.has(b.id);
        if (aAdded === bAdded) return a.name.localeCompare(b.name);
        return aAdded ? 1 : -1;
      });
      return copy;
    },
    [existingSet]
  );

  // Shared list refresh after either Refresh or Reauth completion.
  // `reauthContext` chooses the friendly "no new" wording.
  const refreshList = useCallback(
    async (reauthContext: boolean): Promise<void> => {
      const prevIds = reauthContext
        ? reauthPrevIdsRef.current ?? new Set(bms.map((b) => b.id))
        : new Set(bms.map((b) => b.id));

      try {
        const resp = await fetch("/api/meta/bms/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId }),
        });
        const data = await resp.json();

        if (data.expired) {
          setTokenExpired(true);
          return;
        }
        if (!resp.ok) {
          throw new Error(data.error || "Refresh failed");
        }

        const newList = (data.bms ?? []) as AvailableBm[];
        const newCount = newList.filter((b) => !prevIds.has(b.id)).length;
        setBMs(sortByAdded(newList));

        if (reauthContext && newCount === 0) {
          setRefreshFlash(
            "No new Business Managers were authorized. Check that your Facebook user has access to those BMs and selected them during Meta authorization."
          );
        } else if (newCount === 0) {
          setRefreshFlash(
            "No new Business Managers found on this Meta account."
          );
        } else {
          setRefreshFlash(
            `Found ${newCount} new Business Manager${
              newCount === 1 ? "" : "s"
            }.`
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Refresh failed");
      }
    },
    [bms, sortByAdded, projectId]
  );

  // Initial load from cache.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `/api/meta/bms?project_id=${encodeURIComponent(projectId)}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (data.expired) setTokenExpired(true);
        if (data.error) setError(String(data.error));
        const list = (data.bms ?? []) as AvailableBm[];
        setBMs(sortByAdded(list));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load BMs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sortByAdded, projectId]);

  // Listen for postMessage from the reauth OAuth popup.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as
        | { type?: string; success?: boolean; error?: string }
        | null;
      if (!data || data.type !== "meta_oauth_result") return;

      if (data.success) {
        // Fan-out to other components that watch connection state.
        emitMetaConnectionChanged();
        void (async () => {
          await refreshList(true);
          setReauthorizing(false);
          reauthPrevIdsRef.current = null;
        })();
      } else {
        setReauthorizing(false);
        reauthPrevIdsRef.current = null;
        setError(data.error || "Reauthorization failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshList]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshFlash(null);
    setError(null);
    setQuotaBanner(null);
    setTokenExpired(false);
    try {
      await refreshList(false);
    } finally {
      setRefreshing(false);
    }
  }

  function handleReauthorize() {
    setError(null);
    setRefreshFlash(null);
    setQuotaBanner(null);
    setTokenExpired(false);
    // Snapshot so we can detect new BMs after consent.
    reauthPrevIdsRef.current = new Set(bms.map((b) => b.id));
    setReauthorizing(true);

    const popup = window.open(
      "/api/meta/connect?mode=reauthorize_bms",
      "metaReauthBms",
      "width=600,height=720"
    );
    if (!popup) {
      setReauthorizing(false);
      reauthPrevIdsRef.current = null;
      setError("Popup blocked. Please allow popups for this site.");
    }
  }

  async function handleAdd(bm: AvailableBm) {
    if (existingSet.has(bm.id)) return;
    setAdding(bm.id);
    setError(null);
    setQuotaBanner(null);
    try {
      const resp = await fetch("/api/meta/project-bms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          meta_bm_id: bm.id,
        }),
      });
      if (resp.status === 402) {
        const d = await resp.json().catch(() => ({}));
        setQuotaBanner({
          limit: Number(d.limit ?? 0),
          used: Number(d.used ?? 0),
        });
        return;
      }
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add BM");
      }
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add BM");
    } finally {
      setAdding(null);
    }
  }

  const busy = refreshing || reauthorizing || !!adding;
  const totalBms = bms.length;
  const availableCount = bms.filter((b) => !existingSet.has(b.id)).length;
  const allAdded = totalBms > 0 && availableCount === 0;

  return (
    <div
      onClick={() => !busy && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0B1020] border border-[#1B2238] rounded-2xl p-6 max-h-[85vh] flex flex-col"
      >
        <div className="mb-3">
          <h3 className="text-base font-semibold">Add Business Manager</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Pick a Business Manager from your connected Meta account. If you
            don&apos;t see a BM here, use one of the actions below.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={busy || tokenExpired}
            title="Re-fetch from Meta using the existing token (no OAuth)"
            className="h-9 px-3 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-xs text-zinc-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? "Refreshing…" : "Refresh from Meta"}
          </button>
          <button
            type="button"
            onClick={handleReauthorize}
            disabled={busy || tokenExpired}
            title="Re-open the Meta consent dialog to grant access to additional Business Managers"
            className="h-9 px-3 rounded-lg border border-[#1877F2]/40 hover:border-[#1877F2]/70 bg-[#1877F2]/5 hover:bg-[#1877F2]/10 text-xs text-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reauthorizing
              ? "Waiting for Meta…"
              : "Authorize more Business Managers"}
          </button>
        </div>

        {tokenExpired && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 text-xs text-amber-200 mb-3">
            Meta token expired. Close this modal and click Reconnect on the
            Meta Ads card to restore access.
          </div>
        )}

        {reauthorizing && (
          <div className="border border-[#1877F2]/30 bg-[#1877F2]/10 rounded-lg px-3 py-2 text-xs text-blue-200 mb-3">
            Waiting for Meta authorization to complete in the popup…
          </div>
        )}

        {quotaBanner && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 text-xs text-amber-200 mb-3">
            Business Manager limit reached for this project. Your {plan.name}{" "}
            plan allows {quotaBanner.limit} BM
            {quotaBanner.limit === 1 ? "" : "s"} per project.
          </div>
        )}

        {error && (
          <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg px-3 py-2 text-xs text-rose-300 mb-3">
            {error}
          </div>
        )}

        {refreshFlash && !error && !tokenExpired && (
          <div className="border border-[#1B2238] bg-black/30 rounded-lg px-3 py-2 text-xs text-zinc-400 mb-3">
            {refreshFlash}
          </div>
        )}

        <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
          {loading && <p className="text-sm text-zinc-500">Loading…</p>}

          {!loading && totalBms === 0 && (
            <p className="text-sm text-zinc-500">
              No Business Managers available on this Meta account. If you
              recently gained access to a new BM, click Refresh from Meta or
              re-authorize access.
            </p>
          )}

          {!loading && allAdded && (
            <p className="text-xs text-zinc-500 px-1 pb-1">
              All cached Business Managers are already added to this project.
              Click Refresh from Meta to pull in newly granted BMs, or
              Authorize more Business Managers to extend Meta access.
            </p>
          )}

          {!loading &&
            bms.map((bm) => {
              const isAdded = existingSet.has(bm.id);
              const pending = adding === bm.id;
              const disabled = isAdded || pending || busy;

              return (
                <button
                  key={bm.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleAdd(bm)}
                  className={
                    isAdded
                      ? "w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg border border-[#1B2238] bg-black/30 text-left opacity-60 cursor-not-allowed"
                      : "w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg border border-[#1B2238] hover:border-[#6D5EF8] bg-[#050816] text-left transition disabled:opacity-50"
                  }
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{bm.name}</p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      Meta ID: {bm.id}
                    </p>
                  </div>
                  {isAdded ? (
                    <span className="text-[10px] uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full shrink-0">
                      Already added
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400 shrink-0">
                      {pending ? "Adding…" : "Add →"}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-300 transition disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
