"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export default function DisconnectMetaModal({
  open,
  onClose,
  onConfirm,
}: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !working) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, working, onClose]);

  if (!open) return null;

  async function handleConfirm() {
    try {
      setWorking(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      onClick={() => !working && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#0B1020] border border-[#1B2238] rounded-3xl p-7"
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-300 mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold mb-2">
          Disconnect Meta?
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          Your stored access token will be deleted. Projects already wired to Meta keep their Business Manager and Ad Account names, but data sync will stop until you reconnect.
        </p>

        {error && (
          <p className="text-rose-300 text-sm mb-4">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="flex-1 h-11 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={working}
            className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm transition disabled:opacity-50"
          >
            {working ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}
