"use client";

import Link from "next/link";
import type { MonthlySnapshot } from "@/server/decisions/types";

/**
 * Stage 34 — onboarding checklist for a brand-new project.
 *
 * Rendered by DecisionEngineSection when `snapshot.adAccounts.length === 0`.
 * Replaces the previous "Місяць іде в плановому темпі" copy that misled
 * users with no data into thinking everything was healthy.
 *
 * Source of truth for step status is the snapshot itself — no extra fetch.
 * Steps map 1:1 to the three minimum inputs the Decision Engine needs
 * (Meta connection, project targets, real sales source).
 */

type StepKey = "meta" | "targets" | "sales";

type Step = {
  key: StepKey;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

export default function DecisionOnboarding({
  snapshot,
}: {
  snapshot: MonthlySnapshot;
}) {
  const steps: Step[] = [
    {
      key: "meta",
      title: "Підключи Meta Ad Accounts",
      description:
        "Без підключеної реклами мозок не бачить ані витрат, ані кампаній — аналізувати немає що.",
      href: "/data-sources?focus=meta",
      cta: "Перейти до Data Sources",
      done: snapshot.adAccounts.length > 0,
    },
    {
      key: "targets",
      title: "Встанови місячні цілі",
      description:
        "Без target ROAS і місячного плану виторгу немає проти чого зводити результат — поради будуть розмиті.",
      href: "/settings",
      cta: "Відкрити Settings",
      done:
        snapshot.plan.targetRevenue > 0 || snapshot.plan.targetRoas > 0,
    },
    {
      key: "sales",
      title: "Підключи підтверджені продажі",
      description:
        "Shopify або Google Sheets — щоб мозок бачив реальні замовлення, а не лише Meta-конверсії.",
      href: "/data-sources",
      cta: "Перейти до Data Sources",
      done: snapshot.totals.realOrders > 0,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === steps.length;

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">
          Decision Engine ще не готовий
        </h3>
        <p className="text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
          Зроби три кроки нижче — і мозок почне щодня аналізувати твій
          місяць та підказувати, де злив і де можна масштабувати.
        </p>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mt-3">
          Прогрес: {completed} з {steps.length}{" "}
          {steps.length === 1 ? "крок" : "кроків"}
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <StepCard key={step.key} index={i + 1} step={step} />
        ))}
      </div>

      {allDone && (
        <p className="text-xs text-emerald-300 text-center">
          Все готово, дані ось-ось з&apos;являться — повертайся за кілька
          хвилин.
        </p>
      )}
    </div>
  );
}

function StepCard({ index, step }: { index: number; step: Step }) {
  return (
    <div
      className={
        step.done
          ? "border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-4 flex items-start gap-4"
          : "border border-[#1B2238] bg-black/30 rounded-xl p-4 flex items-start gap-4"
      }
    >
      <StatusBadge index={index} done={step.done} />

      <div className="flex-1 min-w-0">
        <h4
          className={
            step.done
              ? "text-sm font-semibold text-emerald-200"
              : "text-sm font-semibold text-white"
          }
        >
          {step.title}
        </h4>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          {step.description}
        </p>
      </div>

      {!step.done && (
        <Link
          href={step.href}
          className="shrink-0 h-9 px-3 rounded-lg bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-xs font-medium transition inline-flex items-center"
        >
          {step.cta}
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ index, done }: { index: number; done: boolean }) {
  if (done) {
    return (
      <span
        className="shrink-0 w-7 h-7 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 inline-flex items-center justify-center"
        aria-label="Виконано"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="shrink-0 w-7 h-7 rounded-full border border-[#1B2238] bg-black/30 text-zinc-300 text-xs font-semibold inline-flex items-center justify-center"
      aria-label={`Крок ${index}`}
    >
      {index}
    </span>
  );
}
