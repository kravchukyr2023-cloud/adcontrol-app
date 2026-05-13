import Link from "next/link";

type Plan = {
  name: string;
  price: string;
  period?: string;
  features: string[];
  cta: string;
  highlight: boolean;
};

const plans: Plan[] = [
  {
    name: "Starter",
    price: "Free",
    features: [
      "1 Project",
      "1 Business Manager",
      "1 Ad Account",
      "Dashboard Overview",
      "Manual Data Sync",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Operator",
    price: "$8.99",
    period: "/ month",
    features: [
      "3 Projects",
      "Google Sheets",
      "Sales & Attribution",
      "UTM Generator",
      "Full Decision Engine",
      "Auto Sync",
    ],
    cta: "Choose Operator",
    highlight: true,
  },
  {
    name: "Team",
    price: "$18.99",
    period: "/ month",
    features: [
      "5 Projects",
      "Shopify Integration",
      "Priority Sync",
      "Revenue Operations",
      "Advanced Diagnostics",
    ],
    cta: "Choose Team",
    highlight: false,
  },
  {
    name: "Scale",
    price: "$49.99",
    period: "/ month",
    features: [
      "15 Projects",
      "225 Ad Accounts",
      "Priority Support",
      "Multi-project Operations",
      "All Features Included",
    ],
    cta: "Choose Scale",
    highlight: false,
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="scroll-mt-20 bg-[#090A0F] text-white py-24 lg:py-32 border-b border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        <div className="max-w-3xl mb-16">
          <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs mb-5">
            Pricing
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            Operational pricing. Clear scale, clear value.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={
                p.highlight
                  ? "relative border border-indigo-500/60 rounded-2xl p-7 bg-gradient-to-b from-indigo-500/10 to-zinc-950 flex flex-col"
                  : "relative border border-zinc-800 rounded-2xl p-7 bg-zinc-950 flex flex-col"
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] bg-indigo-500 text-white px-3 py-1 rounded-full font-medium">
                  Recommended
                </span>
              )}

              <div className="mb-7">
                <h3 className="text-xl font-semibold mb-3">{p.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{p.price}</span>
                  {p.period && (
                    <span className="text-sm text-zinc-500">{p.period}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-3 text-sm text-zinc-400 flex-1 mb-8">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/auth"
                className={
                  p.highlight
                    ? "bg-white text-black text-center py-3 rounded-xl font-medium hover:bg-zinc-200 transition"
                    : "border border-zinc-700 text-center py-3 rounded-xl hover:border-zinc-500 transition"
                }
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-zinc-500 mt-10">
          Payments are not active in this demo.
        </p>

      </div>
    </section>
  );
}
