"use client";

import { useEffect, useState } from "react";
import { ADDONS } from "@/config/plans";
import { purchaseExtraAdAccount } from "@/lib/billing/purchase-extra-ad-account";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ExtraAdAccountModal({ open, onClose }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const price = ADDONS.existingProjectAdAccount.priceMonthly;
  const total = quantity * price;
  const canBuy = !buying && quantity > 0;

  async function handleBuy() {
    try {
      setBuying(true);
      setError("");
      await purchaseExtraAdAccount(quantity);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Purchase failed."
      );
    } finally {
      setBuying(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#0B1020] border border-[#1B2238] rounded-3xl p-7"
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-1">
          Configure
        </p>
        <h2 className="text-xl font-semibold mb-2">
          Extra Ad Account
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5">
          ${price}/month per Ad Account. Adds 1 Ad Account to your total.
        </p>

        <div className="flex items-center justify-between gap-3 border border-[#1B2238] bg-[#050816] rounded-xl px-3 py-2.5">
          <div>
            <p className="text-sm text-zinc-200">Extra Ad Accounts</p>
            <p className="text-[11px] text-zinc-500">
              ${price}/mo each — adds 1 Ad Account
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              aria-label="Remove one"
              className="w-8 h-8 rounded-md border border-[#1B2238] hover:border-zinc-700 hover:bg-[#1B2238]/60 text-zinc-300 text-base transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold text-white">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              aria-label="Add one"
              className="w-8 h-8 rounded-md border border-[#1B2238] hover:border-zinc-700 hover:bg-[#1B2238]/60 text-zinc-300 text-base transition"
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[#1B2238] flex items-center justify-between">
          <span className="text-sm text-zinc-400">Total monthly</span>
          <span className="text-xl font-bold text-white">
            ${total}/mo
          </span>
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-3">{error}</p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleBuy}
            disabled={!canBuy}
            className="h-11 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition disabled:opacity-50"
          >
            {buying ? "Processing…" : `Apply demo purchase — $${total}/mo`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={buying}
            className="h-11 rounded-xl border border-[#1B2238] hover:border-zinc-700 text-zinc-300 text-sm transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 mt-4 text-center">
          Demo purchase mode. In production, this action will redirect to payment and activate after successful payment.
        </p>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-9 h-9 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B2238] flex items-center justify-center transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
