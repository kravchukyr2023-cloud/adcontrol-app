import Link from "next/link";
import { en } from "@/messages/en";

const bars = [40, 62, 48, 78, 55, 72, 88];

export default function LandingHero() {
  const t = en.hero;
  return (
    <section className="bg-[#090A0F] text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-20 lg:py-28">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          <div>
            <span className="inline-flex items-center gap-2 text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-full mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              {t.badge}
            </span>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight mb-6">
              {t.h1}
            </h1>

            <p className="text-zinc-400 text-lg leading-relaxed max-w-xl mb-10">
              {t.sub}
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-10">
              <Link
                href="/auth"
                className="bg-white text-black px-5 py-3 rounded-xl font-medium hover:bg-zinc-200 transition"
              >
                {t.primaryCta}
              </Link>
              <Link
                href="/auth"
                className="border border-zinc-700 text-zinc-200 px-5 py-3 rounded-xl hover:border-zinc-500 transition"
              >
                {t.secondaryCta}
              </Link>
              <Link
                href="/auth"
                className="text-sm text-zinc-400 hover:text-white px-3 py-2 transition"
              >
                {t.loginLink}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              {t.tags.map((tag, i) => (
                <span key={tag} className="flex items-center gap-3">
                  {i > 0 && <span className="text-zinc-700">·</span>}
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-indigo-500/20 to-purple-600/10 rounded-3xl blur-2xl" />
            <div className="relative border border-zinc-800 rounded-2xl bg-zinc-950 overflow-hidden shadow-2xl">

              <div className="flex items-center gap-2 px-4 h-9 border-b border-zinc-900 bg-zinc-950">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                </div>
                <div className="flex-1 ml-3 h-5 bg-black/40 border border-zinc-800 rounded text-[10px] text-zinc-500 px-2 flex items-center">
                  {t.mock.urlBar}
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {t.mock.metrics.map((m) => (
                    <div
                      key={m.label}
                      className={metricCardStyle(m.tone)}
                    >
                      <p className={metricLabelStyle(m.tone)}>{m.label}</p>
                      <p className={metricValueStyle(m.tone)}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="border border-zinc-800 rounded-lg p-4 bg-black/30">
                  <div className="flex items-end justify-between gap-1.5 h-20">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-sm"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="border border-indigo-500/40 rounded-lg p-3 bg-indigo-500/5">
                  <p className="text-[10px] text-indigo-300 uppercase tracking-wide mb-1">
                    {t.mock.engineLabel}
                  </p>
                  <p className="text-xs text-white leading-relaxed">
                    {t.mock.engineText}
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}

function metricCardStyle(tone: string): string {
  const base = "border rounded-lg p-2.5 bg-black/40";
  if (tone === "meta") return `${base} border-zinc-800`;
  if (tone === "real") return `${base} border-rose-500/40 bg-rose-500/5`;
  return `${base} border-zinc-800`;
}

function metricLabelStyle(tone: string): string {
  const base = "text-[10px] uppercase tracking-wide";
  if (tone === "real") return `${base} text-rose-300`;
  return `${base} text-zinc-500`;
}

function metricValueStyle(tone: string): string {
  const base = "text-sm font-bold mt-1";
  if (tone === "real") return `${base} text-rose-200`;
  return `${base} text-white`;
}
