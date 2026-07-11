"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function LocaleSwitcher({ active }: { active: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function set(next: Locale) {
    if (next === active) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="ls" aria-label="Language" data-pending={isPending || undefined}>
      <button
        type="button"
        className={active === "uk" ? "ls-btn active" : "ls-btn"}
        onClick={() => set("uk")}
        aria-pressed={active === "uk"}
      >
        УКР
      </button>
      <span className="ls-sep" aria-hidden="true">|</span>
      <button
        type="button"
        className={active === "en" ? "ls-btn active" : "ls-btn"}
        onClick={() => set("en")}
        aria-pressed={active === "en"}
      >
        ENG
      </button>
    </div>
  );
}
