"use client";

import { useEffect, useMemo, useState } from "react";
import { useGoogleSheetsStatus } from "@/hooks/use-google-sheets-status";

// Placeholder template URL — replace with a real public Google Sheets template
// link once design hands one off. Keeping it inline so swapping later is a
// single-line edit; no need for an env var.
const TEMPLATE_URL =
  "https://docs.google.com/spreadsheets/d/1adcontrol-template-placeholder/copy";

type TemplateColumn = {
  name: string;
  type: "date" | "text" | "number";
  required: boolean;
  note?: string;
};

const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { name: "date", type: "date", required: true, note: "YYYY-MM-DD" },
  { name: "order_id", type: "text", required: true },
  { name: "customer_name", type: "text", required: false },
  { name: "customer_email", type: "text", required: false },
  { name: "product", type: "text", required: false },
  { name: "revenue", type: "number", required: true },
  { name: "currency", type: "text", required: true, note: "3-letter ISO, e.g. USD" },
  { name: "utm_source", type: "text", required: false },
  { name: "utm_medium", type: "text", required: false },
  { name: "utm_campaign", type: "text", required: false },
  { name: "utm_content", type: "text", required: false },
  { name: "utm_term", type: "text", required: false },
];

const statusStyles = {
  available: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  warning: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  error: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  placeholder: "text-zinc-400 border-[#1B2238] bg-black/30",
} as const;

type Spreadsheet = { id: string; name: string };

type Banner = { kind: "success"; text: string } | { kind: "error"; text: string };
type BannerState = Banner | null;

export default function GoogleSheetsCard({
  projectId,
  projectName,
}: {
  projectId: string | null;
  projectName: string | null;
}) {
  const { loading, status, error, refresh } = useGoogleSheetsStatus(projectId);

  // When the user clicks "Change spreadsheet" we force the picker UI even
  // though the server still has a validated spreadsheet_id. The state
  // collapses naturally once they re-select (status refetches with the new
  // spreadsheet_id) or disconnect.
  const [forcePicker, setForcePicker] = useState(false);

  const [banner, setBanner] = useState<BannerState>(null);

  // Honor ?success=google_sheets_connected / ?error=... from the OAuth
  // callback redirect. Once observed, strip the params from the URL so a
  // refresh doesn't re-trigger the banner.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const err = params.get("error");
    if (success !== "google_sheets_connected" && !err) return;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (success === "google_sheets_connected") {
        setBanner({ kind: "success", text: "Google account connected." });
      } else if (err) {
        setBanner({ kind: "error", text: formatOauthError(err) });
      }
      params.delete("success");
      params.delete("error");
      params.delete("project_id");
      const next =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", next);
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const currentState = useMemo(
    () => deriveState(loading, status, forcePicker),
    [loading, status, forcePicker]
  );

  return (
    <div className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020] flex flex-col">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-start gap-4">
          <SheetsIcon />
          <div>
            <h2 className="text-lg font-semibold text-white">Google Sheets</h2>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              Import sales data from Google Sheets to calculate Real ROAS for{" "}
              {projectName ? (
                <span className="text-white">{projectName}</span>
              ) : (
                "this project"
              )}
              .
            </p>
          </div>
        </div>
        <StatusBadge state={currentState} googleEmail={status?.google_email ?? null} />
      </div>

      {banner && (
        <div
          className={
            banner.kind === "success"
              ? "mb-4 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-start justify-between gap-3"
              : "mb-4 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-start justify-between gap-3"
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

      {error && (
        <div className="mb-4 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {!projectId && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
          Select or create a project before connecting Google Sheets.
        </div>
      )}

      {projectId && currentState === "loading" && (
        <p className="text-sm text-zinc-500">Loading Google Sheets status…</p>
      )}

      {projectId && currentState === "not_connected" && (
        <NotConnectedState projectId={projectId} />
      )}

      {projectId && currentState === "connected_no_sheet" && status && (
        <SelectSheetState
          projectId={projectId}
          googleEmail={status.google_email}
          onChanged={() => {
            setForcePicker(false);
            refresh();
          }}
        />
      )}

      {projectId && currentState === "connected_validated" && status && (
        <ValidatedState
          projectId={projectId}
          googleEmail={status.google_email}
          spreadsheetName={status.spreadsheet_name}
          lastSyncAt={status.last_sync_at}
          onChangeSheet={() => setForcePicker(true)}
          onBanner={setBanner}
          onChanged={refresh}
        />
      )}

      {projectId && currentState === "error" && status && (
        <ErrorStateView
          projectId={projectId}
          googleEmail={status.google_email}
          lastError={status.last_error}
          onChanged={refresh}
        />
      )}

      {/* Template block is visible whenever the user is past the initial
          connect step — it documents the exact column contract the
          /select endpoint enforces, so the user can fix mismatches without
          guessing. */}
      {projectId &&
        (currentState === "connected_no_sheet" ||
          currentState === "error" ||
          currentState === "connected_validated") && <TemplateBlock />}
    </div>
  );
}

type DerivedState =
  | "loading"
  | "not_connected"
  | "connected_no_sheet"
  | "connected_validated"
  | "error";

function deriveState(
  loading: boolean,
  status: ReturnType<typeof useGoogleSheetsStatus>["status"],
  forcePicker: boolean
): DerivedState {
  if (loading || !status) return "loading";
  if (status.status === "error") return "error";
  if (!status.connected || status.status === "not_connected") {
    return "not_connected";
  }
  if (status.status === "disconnected") return "not_connected";
  if (status.spreadsheet_id && !forcePicker) return "connected_validated";
  return "connected_no_sheet";
}

function formatOauthError(code: string): string {
  switch (code) {
    case "invalid_state":
      return "Connection link expired. Please try again.";
    case "user_mismatch":
      return "Session mismatch. Please re-authorize while signed in to AdControl.";
    case "missing_code_or_state":
      return "Google didn't return an authorization code. Please retry.";
    case "exchange_failed":
      return "Failed to exchange Google authorization code. Please retry.";
    case "server_misconfiguration":
      return "Server misconfiguration. Please contact support.";
    case "db_error":
      return "Database error while saving connection. Please retry.";
    case "unauthorized":
      return "Please sign in and retry.";
    case "access_denied":
      return "You denied access to Google. The connection was not created.";
    default:
      return `Google connection failed: ${code}`;
  }
}

function StatusBadge({
  state,
  googleEmail,
}: {
  state: DerivedState;
  googleEmail: string | null;
}) {
  const dotCls = (color: "emerald" | "amber" | "rose" | "zinc") => {
    switch (color) {
      case "emerald":
        return "bg-emerald-400";
      case "amber":
        return "bg-amber-400";
      case "rose":
        return "bg-rose-400";
      default:
        return "bg-zinc-500";
    }
  };

  if (state === "loading") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.placeholder}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls("zinc")}`} />
        Loading
      </span>
    );
  }
  if (state === "not_connected") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.placeholder}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls("zinc")}`} />
        Not connected
      </span>
    );
  }
  if (state === "connected_no_sheet") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.warning}`}
        title={googleEmail ?? undefined}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls("amber")}`} />
        Connected — pick sheet
      </span>
    );
  }
  if (state === "connected_validated") {
    return (
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.available}`}
        title={googleEmail ?? undefined}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls("emerald")}`} />
        Connected
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${statusStyles.error}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls("rose")}`} />
      Error
    </span>
  );
}

function NotConnectedState({ projectId }: { projectId: string }) {
  function handleConnect() {
    // Top-level redirect (not popup) — Google's callback redirects back
    // to /data-sources, so the page reloads with success/error params
    // we already handle in the parent effect.
    window.location.href = `/api/google/oauth/start?project_id=${encodeURIComponent(
      projectId
    )}`;
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <p className="text-sm text-zinc-400">
        Authorize AdControl to read your Google Sheets and Drive (read-only).
      </p>
      <button
        type="button"
        onClick={handleConnect}
        className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition inline-flex items-center justify-center"
      >
        Connect Google Sheets
      </button>
    </div>
  );
}

function SelectSheetState({
  projectId,
  googleEmail,
  onChanged,
}: {
  projectId: string;
  googleEmail: string | null;
  onChanged: () => void;
}) {
  const [list, setList] = useState<Spreadsheet[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListError(null);
      setTokenExpired(false);
      try {
        const resp = await fetch(
          `/api/google/sheets/list?project_id=${encodeURIComponent(projectId)}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (resp.status === 401) {
          setTokenExpired(true);
          setList([]);
          return;
        }
        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({}))) as {
            error?: string;
          };
          setListError(body.error ?? `Failed to load (${resp.status})`);
          setList([]);
          return;
        }
        const data = (await resp.json()) as { spreadsheets: Spreadsheet[] };
        setList(data.spreadsheets ?? []);
      } catch (err) {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : "Network error");
        setList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleSelect() {
    if (!selected) return;
    setWorking(true);
    setActionError(null);
    try {
      const selectedName =
        list?.find((s) => s.id === selected)?.name ?? null;
      const resp = await fetch("/api/google/sheets/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          spreadsheet_id: selected,
          spreadsheet_name: selectedName,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!resp.ok || !data.ok) {
        setActionError(data.error ?? `Validation failed (${resp.status})`);
        setWorking(false);
        return;
      }
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Network error");
      setWorking(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Sheets from this project?")) return;
    await disconnectGoogle(projectId);
    onChanged();
  }

  async function handleReconnect() {
    window.location.href = `/api/google/oauth/start?project_id=${encodeURIComponent(
      projectId
    )}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 border border-[#1B2238] rounded-xl bg-black/30 px-4 py-3">
        <div>
          Account:{" "}
          <span className="text-zinc-200">{googleEmail ?? "—"}</span>
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          className="h-8 px-3 rounded-lg border border-rose-500/40 hover:border-rose-500/70 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 text-xs transition"
        >
          Disconnect
        </button>
      </div>

      {tokenExpired ? (
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-amber-200">
          <span>Connection expired. Please reconnect.</span>
          <button
            type="button"
            onClick={handleReconnect}
            className="h-9 px-4 rounded-lg bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition"
          >
            Reconnect
          </button>
        </div>
      ) : list === null ? (
        <div className="text-sm text-zinc-400 flex items-center gap-2">
          <Spinner />
          Loading your Google Sheets…
        </div>
      ) : listError ? (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-sm text-rose-200">
          {listError}
        </div>
      ) : list.length === 0 ? (
        <div className="border border-[#1B2238] rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-400">
          No spreadsheets found in your Google Drive. Copy the template below
          and refresh.
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="gs-spreadsheet"
              className="block text-xs uppercase tracking-wider text-zinc-500 mb-1"
            >
              Choose spreadsheet
            </label>
            <select
              id="gs-spreadsheet"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-black/40 border border-[#1B2238] text-sm text-white focus:border-[#6D5EF8] focus:outline-none"
            >
              <option value="">— Select a spreadsheet —</option>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSelect}
              disabled={!selected || working}
              className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
            >
              {working ? "Validating…" : "Select & Validate"}
            </button>
          </div>

          {actionError && (
            <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-sm text-rose-200">
              {actionError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ValidatedState({
  projectId,
  googleEmail,
  spreadsheetName,
  lastSyncAt,
  onChangeSheet,
  onBanner,
  onChanged,
}: {
  projectId: string;
  googleEmail: string | null;
  spreadsheetName: string | null;
  lastSyncAt: string | null;
  onChangeSheet: () => void;
  onBanner: (b: BannerState) => void;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Sheets from this project?")) return;
    setWorking(true);
    await disconnectGoogle(projectId);
    setWorking(false);
    onChanged();
  }

  async function handleSync() {
    setSyncing(true);
    onBanner(null);
    try {
      const resp = await fetch("/api/google/sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = (await resp.json().catch(() => ({}))) as SyncResponse;

      if (!resp.ok) {
        onBanner({
          kind: "error",
          text: data.error ?? `Sync failed (${resp.status})`,
        });
        return;
      }

      onBanner({
        kind: data.ok === false ? "error" : "success",
        text: formatSyncResult(data),
      });
    } catch (err) {
      onBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSyncing(false);
      // Refresh status so last_synced_at + error state reflect the sync.
      onChanged();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 border border-[#1B2238] rounded-xl bg-black/30 px-4 py-3">
        <div>
          Account:{" "}
          <span className="text-zinc-200">{googleEmail ?? "—"}</span>
        </div>
      </div>

      <div className="border border-[#1B2238] rounded-xl bg-black/30 px-4 py-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Selected spreadsheet
        </div>
        <div className="text-sm font-semibold text-white">
          {spreadsheetName ?? "Untitled spreadsheet"}
        </div>
        <div className="text-xs text-zinc-500 mt-2">
          Last synced: {lastSyncAt ? formatDate(lastSyncAt) : "never"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
        <button
          type="button"
          onClick={onChangeSheet}
          disabled={working || syncing}
          className="h-11 px-5 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-200 transition disabled:opacity-50"
        >
          Change spreadsheet
        </button>
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

function ErrorStateView({
  projectId,
  googleEmail,
  lastError,
  onChanged,
}: {
  projectId: string;
  googleEmail: string | null;
  lastError: string | null;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Sheets from this project?")) return;
    setWorking(true);
    await disconnectGoogle(projectId);
    setWorking(false);
    onChanged();
  }

  // "Fix & retry" — the actual fix path differs by error type:
  //   - column mismatch: user updates the sheet and re-selects → back to picker
  //   - token expired: user must re-OAuth
  // Without parsing the error string we route to the safer of the two: just
  // refresh status and let the picker (Stage 2) re-appear; if the user is
  // actually token-expired the /list 401 will surface the Reconnect button.
  async function handleFixRetry() {
    onChanged();
  }

  const tokenExpired =
    !!lastError &&
    /token expired|please reconnect/i.test(lastError);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 border border-[#1B2238] rounded-xl bg-black/30 px-4 py-3">
        <div>
          Account:{" "}
          <span className="text-zinc-200">{googleEmail ?? "—"}</span>
        </div>
      </div>

      <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-3 text-sm text-rose-200">
        {lastError ?? "Google Sheets connection is in error state."}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tokenExpired ? (
          <button
            type="button"
            onClick={() => {
              window.location.href = `/api/google/oauth/start?project_id=${encodeURIComponent(
                projectId
              )}`;
            }}
            className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition"
          >
            Reconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFixRetry}
            disabled={working}
            className="h-11 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition disabled:opacity-50"
          >
            Fix &amp; retry
          </button>
        )}
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

function TemplateBlock() {
  return (
    <div className="mt-6 border-t border-[#1B2238] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Template</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Your Google Sheet must have these columns in exact order.
          </p>
        </div>
        <a
          href={TEMPLATE_URL}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-4 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-xs text-zinc-200 transition inline-flex items-center justify-center"
        >
          Open template
        </a>
      </div>

      <div className="overflow-x-auto border border-[#1B2238] rounded-xl">
        <table className="w-full text-xs">
          <thead className="text-zinc-500">
            <tr className="border-b border-[#1B2238]">
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">Column</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Required</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {TEMPLATE_COLUMNS.map((c, i) => (
              <tr key={c.name} className="border-b border-[#1B2238] last:border-0">
                <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-white">{c.name}</td>
                <td className="px-3 py-2 text-zinc-400">{c.type}</td>
                <td className="px-3 py-2">
                  {c.required ? (
                    <span className="text-emerald-400">✅</span>
                  ) : (
                    <span className="text-zinc-500">❌</span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-500">{c.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SheetsIcon() {
  return (
    <div className="w-11 h-11 rounded-xl border bg-emerald-500/15 border-emerald-500/30 text-emerald-300 flex items-center justify-center">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
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

async function disconnectGoogle(projectId: string): Promise<void> {
  await fetch("/api/google/sheets/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId }),
  }).catch(() => null);
}

type SyncResponse = {
  ok?: boolean;
  total_rows?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: Array<{ rowIndex: number; reason: string }>;
  truncated?: boolean;
  message?: string;
  error?: string;
};

function formatSyncResult(data: SyncResponse): string {
  if (data.message && (data.total_rows ?? 0) === 0) {
    return data.message;
  }

  const inserted = data.inserted ?? 0;
  const updated = data.updated ?? 0;
  const skipped = data.skipped ?? 0;
  const total = inserted + updated;

  const parts = [`Synced ${total} orders (${inserted} new, ${updated} updated, ${skipped} skipped)`];

  if (data.truncated && data.message) {
    parts.push(data.message);
  }

  if (skipped > 0 && data.errors && data.errors.length > 0) {
    const sample = data.errors
      .slice(0, 3)
      .map((e) => `row ${e.rowIndex}: ${e.reason}`)
      .join("; ");
    parts.push(
      `First skipped: ${sample}${
        data.errors.length > 3 ? ` (+${data.errors.length - 3} more)` : ""
      }`
    );
  }

  return parts.join(" — ");
}
