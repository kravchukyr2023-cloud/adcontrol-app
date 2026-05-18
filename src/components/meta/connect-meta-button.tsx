"use client";

import { useEffect, useState } from "react";
import { emitMetaConnectionChanged } from "@/lib/meta/events";

type Props = {
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
};

export default function ConnectMetaButton({
  label = "Connect with Facebook",
  variant = "primary",
  className,
}: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as
        | { type?: string; success?: boolean; error?: string }
        | null;
      if (!data || data.type !== "meta_oauth_result") return;

      setWorking(false);
      if (data.success) {
        setError(null);
        emitMetaConnectionChanged();
      } else {
        setError(data.error || "Connection failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleClick() {
    setError(null);
    setWorking(true);
    const popup = window.open(
      "/api/meta/connect",
      "metaOAuth",
      "width=600,height=720"
    );
    if (!popup) {
      setWorking(false);
      setError("Popup was blocked. Please allow popups for this site.");
    }
  }

  const baseCls =
    variant === "primary"
      ? "h-11 px-5 rounded-xl bg-[#1877F2] hover:bg-[#1366d6] text-white text-sm font-medium transition disabled:opacity-50"
      : "h-10 px-4 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-200 transition disabled:opacity-50";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={working}
        className={baseCls}
      >
        {working ? "Opening Meta…" : label}
      </button>
      {error && (
        <p className="text-xs text-rose-300 mt-2">{error}</p>
      )}
    </div>
  );
}
