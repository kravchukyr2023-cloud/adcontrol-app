/**
 * Sprint 7 stage 7.2 — landing copy source of truth.
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
      product: "Product",
      howItWorks: "How it works",
      access: "Early access",
      security: "Security",
    },
    login: "Login",
    cta: "Get access",
  },

  hero: {
    badge: "Real sales. Not Meta's numbers.",
    h1: "Meta reports 315 purchases. You had 2.",
    sub: "AdControl scores your ads against confirmed orders — not platform reporting. It shows where budget burns, what to scale, and what to do next. As concrete tasks, not charts.",
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
    label: "The problem",
    h2: "Most ad accounts do not have a traffic problem. They have an operations problem.",
    cards: [
      {
        title: "Platform ROAS is not enough",
        body: "Meta reports a number that looks profitable while real revenue tells a different story.",
        color: "bg-indigo-500",
      },
      {
        title: "Data lives in silos",
        body: "Ads, sales, attribution and goals never sit in the same place at the same time.",
        color: "bg-cyan-500",
      },
      {
        title: "Numbers stop at metrics",
        body: "Dashboards show CTR, CPC, ROAS — but never explain what to do next.",
        color: "bg-amber-500",
      },
      {
        title: "Budget leaks before anyone sees it",
        body: "Spend keeps going while a campaign is already broken — and nothing surfaces it.",
        color: "bg-rose-500",
      },
    ],
  },

  operationalControl: {
    label: "Why AdControl",
    h2: "Operational control, not just dashboards.",
    items: [
      {
        title: "Centralized marketing operations",
        body: "Every campaign, account and signal in one operating layer. Stop juggling tabs, screenshots and exports.",
      },
      {
        title: "Unified data, one workspace",
        body: "Ad spend, real revenue, attribution and business targets live together — not in five disconnected tools.",
      },
      {
        title: "Structured decision flow",
        body: "From signal to diagnosis to action. Every decision has a trace, not a guess from memory.",
      },
    ],
  },

  howItWorks: {
    label: "How it works",
    h2: "From disconnected data to operational decisions.",
    steps: [
      { n: "01", t: "Connect data", b: "Plug in Meta Ads, sales sources and attribution. Everything in one operational view." },
      { n: "02", t: "Detect losses", b: "Find leaks the moment they happen — not at end-of-month review." },
      { n: "03", t: "Diagnose problems", b: "Move from a metric to a cause: which campaign, which ad set, which creative." },
      { n: "04", t: "Prioritize actions", b: "Most-impact moves first. No more random changes that cancel each other out." },
      { n: "05", t: "Execute decisions", b: "Apply the change in the source platform with a clear audit trail." },
      { n: "06", t: "Validate results", b: "Confirm the decision actually moved revenue, not just a dashboard number." },
    ],
  },

  decisionEngine: {
    label: "Decision engine",
    h2: "Ad Decision Engine. Diagnosis, not dashboards.",
    body: "AdControl surfaces what matters and tells you what to do next — instead of leaving you to interpret another chart.",
    signals: [
      "Revenue leaks",
      "Scaling opportunities",
      "Attribution gaps",
      "Priority actions",
    ],
    mock: {
      alert: "Revenue leak detected",
      title: "Campaign overspending against zero attributed revenue",
      signalLabel: "Signal",
      signalText: "Spend +18% this week, real ROAS dropped from 2.9 to 0.6.",
      diagnosisLabel: "Diagnosis",
      diagnosisText: "Broad-targeting campaign is no longer converting on the original creative.",
      actionLabel: "Recommended action",
      actionText: "Pause the under-performing ad set and reallocate budget to top retargeting cluster.",
      cta: "Open Diagnosis",
    },
  },

  workspace: {
    label: "The product",
    h2: "One workspace. Spend, revenue, attribution, decisions.",
    modules: [
      {
        icon: "⟡",
        name: "Dashboard",
        body: "Spend, revenue and decision signals in one operational view.",
        chips: ["KPI", "Goals", "Alerts"],
      },
      {
        icon: "◆",
        name: "Meta Ads",
        body: "Campaigns, ad sets and creatives with diagnostic context.",
        chips: ["BM", "Accounts", "Creatives"],
      },
      {
        icon: "◯",
        name: "Sales & Attribution",
        body: "Real orders matched against ad spend and campaigns.",
        chips: ["Orders", "AOV", "Real ROAS"],
      },
      {
        icon: "⊕",
        name: "UTM Generator",
        body: "Structured tagging so attribution actually works.",
        chips: ["Presets", "Validation"],
      },
      {
        icon: "✎",
        name: "Data Sources",
        body: "Meta, Shopify, Google Sheets connected as operational sources.",
        chips: ["Meta", "Shopify", "Sheets"],
      },
      {
        icon: "⚙",
        name: "Business Control Center",
        body: "Currency, timezone, monthly goals and sync intervals.",
        chips: ["Goals", "Sync", "Plan"],
      },
    ],
  },

  access: {
    label: "Early access",
    h2: "AdControl is in early access.",
    body: "Create an account to join the list and get into the live demo — a real workspace with real numbers you can click through.",
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
    h2: "Create your operational marketing workspace.",
    primary: "Get access",
    secondary: "See live demo",
  },

  footer: {
    tagline: "Operational marketing workspace for paid advertising.",
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
