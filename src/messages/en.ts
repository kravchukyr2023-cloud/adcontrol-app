/**
 * Sprint 7 — landing copy source of truth.
 *
 * Every string rendered on the public landing lives here. Values are
 * copied verbatim from adcontrol-landing-final.html, which is the
 * approved design reference. Do not paraphrase.
 */

export const en = {
  header: {
    logo: "AdControl",
    nav: {
      howItWorks: "How it works",
      engine: "The engine",
      whoItsFor: "Who it's for",
      faq: "FAQ",
    },
    login: "Log in",
    cta: "Get access",
  },

  hero: {
    badge: "OPTIMISE ON CONFIRMED SALES",
    h1Before: "Optimise on the sales",
    h1After: "you ",
    h1Highlight: "actually made",
    h1End: ".",
    lede:
      "AdControl matches every order back to the ad that produced it. You stop steering on the platform's estimate and start steering on numbers you can verify.",
    primaryCta: "Get access",
    secondaryCta: "See live demo",
    fine:
      "Free while in early access. Works with Meta Ads, Shopify and Google Sheets.",
  },

  compareTable: {
    campaignLabel: "CAMPAIGN",
    campaignName: "Lookalike 1% — Skincare",
    claimLabel: "META ADS SAYS",
    claimName: "Estimated",
    trueLabel: "ADCONTROL SAYS",
    trueName: "Confirmed",
    actionLabel: "WHAT YOU OPTIMISE ON",
    rows: [
      {
        metric: "Purchases",
        claim: "253",
        trueVal: "186",
        action: "Budget planned on the volume that actually converted.",
        win: false,
      },
      {
        metric: "Revenue",
        claim: "$121,000",
        trueVal: "$98,400",
        action: "Targets set on money that reached your account.",
        win: false,
      },
      {
        metric: "ROAS",
        claim: "×3.03",
        trueVal: "×2.46",
        action: "Scaling decisions made on the true ratio, not an estimate.",
        win: false,
      },
      {
        metric: "Best ad",
        claim: "not surfaced",
        trueVal: "Serum 15s · ×5.00",
        action: "The one ad genuinely worth scaling — found for you.",
        win: true,
      },
    ],
    footBefore: "Same campaign, two sets of numbers. ",
    footHighlight: "You optimise on the right one.",
  },

  numbersStrip: [
    {
      value: "×5.00",
      tone: "true" as const,
      desc:
        "The ad genuinely worth scaling — surfaced for you, ranked by revenue impact.",
    },
    {
      value: "$8,387",
      tone: "ink" as const,
      desc:
        "Budget you get back from campaigns that look fine but sell nothing.",
    },
    {
      value: "Real",
      tone: "true" as const,
      desc:
        "ROAS on every campaign, ad set and ad — matched to confirmed orders.",
    },
    {
      value: "0",
      tone: "ink" as const,
      desc:
        "Guesses. Hard rules make the call. The model only puts it into words.",
    },
  ],

  howItWorks: {
    label: "HOW IT WORKS",
    h2: "Three moves to numbers you can scale on.",
    steps: [
      {
        index: "01 — CONNECT",
        title: "Connect ads and sales",
        body:
          "Meta Ads on one side, confirmed orders from Shopify or Sheets on the other. UTM tags tie every sale back to the ad that produced it.",
      },
      {
        index: "02 — MATCH",
        title: "Get your true numbers",
        body:
          "Real ROAS on every campaign, ad set and ad — built from orders that landed, not from platform estimates.",
      },
      {
        index: "03 — SCALE",
        title: "Act on them",
        body:
          "Scale this. Hold that. Fix this gap. Ranked by revenue impact, each with the numbers behind the call.",
      },
    ],
  },

  engine: {
    label: "THE ENGINE",
    h2: "It finds the winner before you do.",
    sd:
      "Deterministic rules decide; the model only puts it into words. Every call names the ad, the number and the next move — and says so plainly when the tracking is thin.",
    card: {
      header: "SERUM BEFORE-AFTER 15s · LOOKALIKE 1%",
      tag: "SCALE THIS",
      cells: [
        {
          k: "SIGNAL",
          v:
            "Real ROAS ×5.00 against a ×3.0 target. $30,000 confirmed revenue on $6,000 spend.",
          act: false,
        },
        {
          k: "DIAGNOSIS",
          v:
            "Best performer in the account by confirmed revenue — and it runs on 12% of the budget. The ceiling has not been tested.",
          act: false,
        },
        {
          k: "ACTION",
          v:
            "1 — Lift this ad and its ad set into a separate campaign.\n2 — Build two new creatives from it and test for three days.",
          act: true,
        },
        {
          k: "EXPECTED RESULT",
          v:
            "Budget moves to the ad that already sells — with the ceiling found, not guessed.",
          act: false,
        },
      ],
    },
  },

  whoItsFor: {
    label: "WHO IT'S FOR",
    h2: "Built for whoever answers for the spend.",
    cards: [
      {
        badge: "MEDIA BUYERS",
        title: "Stop defending numbers you don't trust",
        body:
          "Walk into the call with confirmed ROAS per campaign, ad set and ad — and a ranked list of what to do next.",
      },
      {
        badge: "E-COMMERCE OWNERS",
        title: "Know what the ads actually returned",
        body:
          "Orders matched to the ad that produced them. Your monthly target measured against money that landed.",
      },
      {
        badge: "AGENCIES",
        title: "Report on results, not estimates",
        body:
          "Every client account scored the same way. No more explaining why the platform's number and the client's bank don't agree.",
      },
    ],
  },

  dataSources: {
    label: "DATA SOURCES",
    h2: "Connect in minutes. No tracking script to install.",
    sd:
      "AdControl reads your ad spend and your orders through official APIs, then matches them with the UTM tags you already use.",
    sources: [
      { name: "Meta Ads", desc: "Campaigns, ad sets, ads, spend" },
      { name: "Shopify", desc: "Confirmed orders and revenue" },
      { name: "Google Sheets", desc: "Any order source you already track" },
    ],
  },

  security: {
    label: "SECURITY",
    h2: "Your numbers stay yours.",
    items: [
      {
        title: "Isolated at the database",
        body:
          "Row-level security. Each project is walled off — you only ever see what you own.",
      },
      {
        title: "Official APIs only",
        body:
          "Sources connect through OAuth. No credentials are stored in plain text, ever.",
      },
      {
        title: "Never resold",
        body:
          "We don't sell, share or aggregate your advertising data. It isn't part of the business model.",
      },
    ],
  },

  faq: {
    label: "QUESTIONS",
    h2: "The ones people actually ask.",
    items: [
      {
        q: "Why don't the platform's numbers match my orders?",
        a:
          "Ad platforms attribute generously — a view, a scroll-past, a click that never converted can all end up counted. That's not fraud, it's how their attribution window works. AdControl doesn't argue with it; it simply re-scores everything against orders that landed, so you have both numbers and can steer on the second one.",
      },
      {
        q: "Do I need to install a tracking script?",
        a:
          "No. AdControl reads spend from Meta through the official API and reads orders from Shopify or Google Sheets. The link between them is the UTM tags you're already putting on your ads.",
      },
      {
        q: "Is this an AI that guesses what to do?",
        a:
          "No. Every recommendation is produced by fixed rules with explicit thresholds — spend share, real ROAS, attribution coverage. The language model only turns that decision into a sentence. It never invents a number or a verdict, and when the tracking is thin it says so instead of pretending.",
      },
      {
        q: "What if my tracking is broken right now?",
        a:
          "Then AdControl tells you that first, before anything else. A recommendation built on 2% attribution coverage is worthless, so the engine flags the gap and hands you the two checks that fix it — rather than quietly producing confident nonsense.",
      },
      {
        q: "What does it cost?",
        a:
          "Free while in early access. Paid plans arrive after launch, and anyone on the early access list keeps their access through the transition.",
      },
    ],
  },

  access: {
    label: "EARLY ACCESS",
    h2: "See your real numbers before you connect a thing.",
    bullets: [
      "A live workspace with real campaigns and real ROAS",
      "Every recommendation the engine would hand you",
      "No ad account required to look around",
    ],
    form: {
      title: "Join the early access list",
      sub: "Accounts open in batches. You get the demo link the moment you're in.",
      placeholder: "you@company.com",
      cta: "Get access",
      fine: "Free while in early access.",
    },
  },

  footer: {
    copyright: "© 2026 AdControl — ad decisions based on confirmed sales.",
    links: [
      { text: "Privacy", href: "#" },
      { text: "Terms", href: "#" },
      { text: "Support", href: "#" },
    ],
  },
};

export type Messages = typeof en;
