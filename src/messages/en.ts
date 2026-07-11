/**
 * Sprint 7 stage 7.3 — landing copy source of truth.
 *
 * Every string rendered on the public landing lives here. Components read
 * from this object; no hardcoded copy in JSX. Prepares the ground for a
 * proper i18n solution later in the sprint — swapping this file for a
 * locale-keyed one will be the whole migration.
 */

export const en = {
  header: {
    logo: "AdControl",
    nav: {
      product: "The product",
      howItWorks: "How it works",
      access: "Early access",
      security: "Security",
    },
    login: "Login",
    cta: "Get access",
  },

  hero: {
    badge: "Confirmed sales. Not Meta's reporting.",
    h1: "Meta reports 315 purchases. You had 2.",
    sub: "AdControl scores every campaign against confirmed orders — not platform numbers. It tells you where budget burns, what to scale, and what to do today. As tasks, not charts.",
    primaryCta: "Get access",
    secondaryCta: "See live demo",
    loginLink: "Login →",
    tags: ["Dashboard", "Meta Ads", "Sales & Attribution"],
    mock: {
      urlBar: "adcontrol.app/dashboard",
      metrics: [
        { label: "Meta ROAS", value: "6.42", tone: "meta" },
        { label: "Real ROAS", value: "0.41", tone: "real" },
        { label: "Real orders", value: "2", tone: "neutral" },
        { label: "Spend", value: "$12.4k", tone: "neutral" },
      ],
      engineLabel: "Ad Decision Engine",
      engineText:
        "Meta reports 315 purchases. Confirmed real orders: 2. Pause and investigate before scaling.",
    },
  },

  problem: {
    label: "Why your ROAS is fiction",
    h2: "Meta grades its own homework. And it grades generously.",
    cards: [
      {
        title: "It counts purchases you didn't get",
        body: "A view-through, a scroll-past, a click that never converted — Meta books it as a sale. Your bank account disagrees.",
        color: "bg-indigo-500",
      },
      {
        title: "It takes credit for buyers you already had",
        body: "Retargeting shows a 6x ROAS by claiming returning customers who were coming back anyway.",
        color: "bg-cyan-500",
      },
      {
        title: "Broken tracking hides the truth",
        body: "When tags don't fire or the purchase event points at the wrong action, real numbers vanish — and nobody tells you.",
        color: "bg-amber-500",
      },
      {
        title: "You scale on the fake number",
        body: "The campaign Meta calls a winner is the one quietly eating your margin. You find out at month-end.",
        color: "bg-rose-500",
      },
    ],
  },

  howItWorks: {
    label: "How it works",
    h2: "Three steps to numbers you can trust.",
    steps: [
      {
        n: "01",
        t: "Connect ads and sales",
        b: "Meta Ads on one side, confirmed orders from Shopify or Sheets on the other. UTM tags tie them together.",
      },
      {
        n: "02",
        t: "The engine scores every campaign",
        b: "Deterministic rules — not a chatbot guessing. Real ROAS, real orders, attribution health, per campaign, ad set and ad.",
      },
      {
        n: "03",
        t: "You get tasks, not charts",
        b: "Pause this. Scale that. Fix this tracking gap. Ranked by revenue impact, with the numbers behind each call.",
      },
    ],
  },

  decisionEngine: {
    label: "The engine",
    h2: "Deterministic rules. Not a chatbot guessing.",
    body: "The engine decides what to recommend — hard-coded rules over confirmed sales. AI only puts it in plain language. It never invents a number or a verdict.",
    signals: [
      "Where budget is burning",
      "What is safe to scale",
      "Where Meta overstates",
      "What to fix first",
    ],
    mock: {
      alert: "Revenue leak detected",
      title: "Campaign overspending against zero attributed revenue",
      signalLabel: "Signal",
      signalText: "Spend +18% this week, real ROAS dropped from 2.9 to 0.6.",
      diagnosisLabel: "Diagnosis",
      diagnosisText:
        "Broad-targeting campaign is no longer converting on the original creative.",
      actionLabel: "Recommended action",
      actionText:
        "Pause the under-performing ad set and reallocate budget to top retargeting cluster.",
      caption: "This is what a recommendation looks like inside the product.",
    },
  },

  workspace: {
    label: "The product",
    h2: "Everything a buyer checks, in one place.",
    modules: [
      {
        name: "Meta Ads",
        body: "Campaigns, ad sets and ads — each with a real-ROAS verdict, not just metrics.",
      },
      {
        name: "Sales & Attribution",
        body: "Confirmed orders matched to the ad that actually produced them.",
      },
      {
        name: "Dashboard",
        body: "Spend against confirmed revenue. Your target versus what's really happening.",
      },
    ],
    more: "UTM generator · Data sources · Monthly goals · Automated sync",
  },

  access: {
    label: "Early access",
    h2: "See it on real numbers before you connect anything.",
    body: "Create an account and you're in the live demo immediately — a full workspace with real campaigns, real leaks and real recommendations. Click through it yourself.",
    bullets: [
      "Full demo workspace, no ad account needed",
      "Every recommendation the engine would give you",
      "Free while in early access",
    ],
    cta: "Create account",
  },

  security: {
    label: "Security",
    h2: "Built so your data stays yours.",
    points: [
      {
        t: "Row-level access",
        b: "Each project is isolated at the database layer — users only see what they own.",
      },
      {
        t: "OAuth connections",
        b: "Data sources connect via official APIs. No credentials are stored in plain text.",
      },
      {
        t: "Privacy-first",
        b: "We do not sell, share or resell your advertising data. Ever.",
      },
    ],
  },

  cta: {
    label: "Get started",
    h2: "Stop scaling on numbers Meta made up.",
    primary: "Get access",
    secondary: "See live demo",
  },

  footer: {
    tagline: "Ad decisions based on confirmed sales.",
    columns: {
      product: {
        title: "Product",
        links: [
          { text: "Product", href: "#product" },
          { text: "Early access", href: "#access" },
          { text: "Security", href: "#security" },
        ],
      },
      company: {
        title: "Company",
        links: [
          { text: "Privacy", href: "#" },
          { text: "Support", href: "#" },
        ],
      },
      account: {
        title: "Account",
        links: [
          { text: "Login", href: "/auth" },
          { text: "Create account", href: "/auth" },
        ],
      },
    },
    copyright: "© 2026 AdControl. All rights reserved.",
    infrastructure: "Marketing Operations Infrastructure",
  },
};

export type Messages = typeof en;
