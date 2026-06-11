"use client";

import { useCallback, useEffect, useState } from "react";

export type GoogleSheetsStatus = {
  connected: boolean;
  status: "active" | "error" | "disconnected" | "not_connected";
  google_email: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

export type GoogleSheetsStatusState = {
  loading: boolean;
  status: GoogleSheetsStatus | null;
  error: string | null;
  refresh: () => void;
};

const INITIAL_STATUS: GoogleSheetsStatus = {
  connected: false,
  status: "not_connected",
  google_email: null,
  spreadsheet_id: null,
  spreadsheet_name: null,
  last_sync_at: null,
  last_error: null,
};

export function useGoogleSheetsStatus(
  projectId: string | null
): GoogleSheetsStatusState {
  const [status, setStatus] = useState<GoogleSheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  const refresh = useCallback(() => setBump((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      // Defer to satisfy react-hooks/set-state-in-effect.
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
        const url = `/api/google/sheets/status?project_id=${encodeURIComponent(
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

        const data = (await resp.json()) as GoogleSheetsStatus;
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

  return { loading, status, error, refresh };
}
