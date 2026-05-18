"use client";

import { MetaConnectionState } from "@/hooks/use-meta-connection";

type Props = {
  connection: MetaConnectionState;
  onReconnect: () => void;
  onDisconnect: () => void;
  disconnecting?: boolean;
};

function fmtExpiry(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MetaConnectionCard({
  connection,
  onReconnect,
  onDisconnect,
  disconnecting,
}: Props) {
  const isConnected = connection.status === "connected";
  const isExpired = connection.status === "expired";

  let badge: { label: string; cls: string };
  if (isConnected) {
    badge = {
      label: "Connected",
      cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    };
  } else if (isExpired) {
    badge = {
      label: "Expired",
      cls: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    };
  } else {
    badge = {
      label: "Disconnected",
      cls: "text-zinc-400 border-[#1B2238] bg-black/30",
    };
  }

  return (
    <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold">Meta Business</h3>
            <span
              className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Connect your Facebook account to load Business Managers and Ad Accounts.
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm mb-5">
        <Row label="Account">
          {connection.metaUserName ? (
            <span className="text-white">
              {connection.metaUserName}
              {connection.metaUserId && (
                <span className="text-zinc-500 text-xs">
                  {" "}
                  (id {connection.metaUserId})
                </span>
              )}
            </span>
          ) : (
            <span className="text-zinc-500">Not connected</span>
          )}
        </Row>

        <Row label="Token expires">
          <span className={isExpired ? "text-amber-300" : "text-zinc-300"}>
            {fmtExpiry(connection.tokenExpiresAt)}
          </span>
        </Row>

        <Row label="Last connected">
          <span className="text-zinc-400">
            {fmtExpiry(connection.lastConnectedAt)}
          </span>
        </Row>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReconnect}
          className="h-10 px-4 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-200 transition"
        >
          {isExpired ? "Reconnect" : "Reconnect Meta"}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="h-10 px-4 rounded-xl border border-rose-500/40 hover:border-rose-500/70 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 text-sm transition disabled:opacity-50"
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
