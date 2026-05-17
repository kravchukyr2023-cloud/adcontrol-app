"use client";

import { useState } from "react";
import ExtraProjectPackageModal from "./extra-project-package-modal";
import ExtraBmPackageModal from "./extra-bm-package-modal";
import ExtraAdAccountModal from "./extra-ad-account-modal";

type Modal = "project" | "bm" | "ad" | null;

type Props = {
  paused?: boolean;
};

export default function ExtraLimitsSection({ paused }: Props) {
  const [openModal, setOpenModal] = useState<Modal>(null);

  return (
    <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">

      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">Add Extra Limits</h3>
        <span className="text-xs text-zinc-500">Paid add-ons</span>
      </div>
      <p className="text-xs text-zinc-500 mb-5">
        Increase quantity limits without upgrading your plan. Each product opens a configuration modal.
      </p>

      {paused && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-xl px-3 py-2 text-xs text-rose-300 mb-4">
          Purchases are paused until your subscription payment is restored.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        <ProductCard
          name="Extra Project Package"
          price={15}
          includes="1 project + 1 BM + 1 Ad Account"
          onClick={() => setOpenModal("project")}
          disabled={paused}
        />

        <ProductCard
          name="Extra Business Manager Package"
          price={10}
          includes="1 BM + 1 Ad Account"
          onClick={() => setOpenModal("bm")}
          disabled={paused}
        />

        <ProductCard
          name="Extra Ad Account"
          price={5}
          includes="1 Ad Account"
          onClick={() => setOpenModal("ad")}
          disabled={paused}
        />

      </div>

      <p className="text-[11px] text-zinc-500 mt-5">
        Demo purchase mode. In production, each action redirects to payment and activates after a successful payment.
      </p>

      <ExtraProjectPackageModal
        open={openModal === "project"}
        onClose={() => setOpenModal(null)}
      />
      <ExtraBmPackageModal
        open={openModal === "bm"}
        onClose={() => setOpenModal(null)}
      />
      <ExtraAdAccountModal
        open={openModal === "ad"}
        onClose={() => setOpenModal(null)}
      />

    </div>
  );
}

function ProductCard({
  name,
  price,
  includes,
  onClick,
  disabled,
}: {
  name: string;
  price: number;
  includes: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="border border-[#1B2238] rounded-2xl p-5 bg-[#050816] flex flex-col">
      <p className="text-sm font-semibold text-white mb-2">{name}</p>
      <p className="text-2xl font-bold text-white mb-1">
        ${price}
        <span className="text-xs font-normal text-zinc-500">
          /month
        </span>
      </p>
      <p className="text-[11px] text-zinc-500 mb-5">
        Includes: {includes}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-auto h-10 rounded-lg bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Configure
      </button>
    </div>
  );
}
