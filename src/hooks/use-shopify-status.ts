"use client";

import { useCallback, useEffect, useState } from "react";
import { META_SYNC_COMPLETED } from "@/lib/meta/events";

export type ShopifyStatus = {
  connected: boolean;
  status: "active" | "error" | "disconnected" | "not_connected";
  shop_url: string | null;
  shop_name: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
};

export type ShopifyStatusState = {
  loading: boolean;
  status: ShopifyStatus | null;
  error: string | null;
  refresh: () => void;
};

const INITIAL_STATUS: ShopifyStatus = {
  connected: false,
  status: "not_connected",
  shop_url: null,
  shop_name: null,
  last_sync_at: null,
  last_successful_sync_at: null,
  last_error: null,
};

export function useShopifyStatus(
  projectId: string | null
): ShopifyStatusState {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  const refresh = useCallback(() => setBump((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setStatus(INITIAL_STATUS);
        setLoading(false);
        setError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    (async () => {
      try {
        const url = `/api/shopify/status?project_id=${encodeURIComponent(
          projectId
        )}`;
        const resp = await fetch(url, { cache: "no-store" });
        if (cancelled) return;

        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? `Status fetch failed (${resp.status})`);
          setStatus(INITIAL_STATUS);
          setLoading(false);
          return;
        }

        const data = (await resp.json()) as ShopifyStatus;
        setStatus(data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Network error";
        setError(msg);
        setStatus(INITIAL_STATUS);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, bump]);

  // Re-fetch when a global sync completes — once the Shopify pipeline is
  // wired (Stage 26) this picks up fresh last_sync_at without a hard reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setBump((v) => v + 1);
    window.addEventListener(META_SYNC_COMPLETED, onSync);
    return () => window.removeEventListener(META_SYNC_COMPLETED, onSync);
  }, []);

  return { loading, status, error, refresh };
}
