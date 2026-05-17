export type FeatureId =
  | "dashboard"
  | "meta_ads_overview"
  | "meta_ads_diagnosis"
  | "utm_generator"
  | "sales_manual"
  | "sales_full_attribution"
  | "data_sources_full"
  | "shopify"
  | "google_sheets"
  | "manual_orders"
  | "auto_sync"
  | "priority_sync"
  | "decision_engine_basic"
  | "decision_engine_full"
  | "revenue_operations"
  | "multi_project_operations"
  | "priority_support";

export type PlanId = "starter" | "operator" | "team" | "scale";

export type Plan = {
  id: PlanId;
  name: string;
  monthlyPrice: number;

  maxProjects: number;
  maxBusinessManagersTotal: number;
  maxBusinessManagersPerProject: number;
  maxAdAccountsTotal: number;
  maxAdAccountsPerBusinessManager: number;

  syncMode: "manual" | "auto" | "priority";
  decisionEngineLevel: "basic" | "full" | "advanced" | "premium";
  supportLevel: "standard" | "priority";

  features: FeatureId[];
  lockedFeatures: FeatureId[];
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 0,
    maxProjects: 1,
    maxBusinessManagersTotal: 1,
    maxBusinessManagersPerProject: 1,
    maxAdAccountsTotal: 1,
    maxAdAccountsPerBusinessManager: 1,
    syncMode: "manual",
    decisionEngineLevel: "basic",
    supportLevel: "standard",
    features: [
      "dashboard",
      "meta_ads_overview",
      "utm_generator",
      "sales_manual",
      "manual_orders",
      "decision_engine_basic",
    ],
    lockedFeatures: [
      "meta_ads_diagnosis",
      "sales_full_attribution",
      "data_sources_full",
      "shopify",
      "google_sheets",
      "auto_sync",
      "priority_sync",
      "decision_engine_full",
      "revenue_operations",
      "multi_project_operations",
      "priority_support",
    ],
  },

  operator: {
    id: "operator",
    name: "Operator",
    monthlyPrice: 8.99,
    maxProjects: 3,
    maxBusinessManagersTotal: 3,
    maxBusinessManagersPerProject: 1,
    maxAdAccountsTotal: 3,
    maxAdAccountsPerBusinessManager: 1,
    syncMode: "auto",
    decisionEngineLevel: "full",
    supportLevel: "standard",
    features: [
      "dashboard",
      "meta_ads_overview",
      "meta_ads_diagnosis",
      "utm_generator",
      "sales_manual",
      "sales_full_attribution",
      "data_sources_full",
      "google_sheets",
      "manual_orders",
      "auto_sync",
      "decision_engine_basic",
      "decision_engine_full",
    ],
    lockedFeatures: [
      "shopify",
      "priority_sync",
      "revenue_operations",
      "multi_project_operations",
      "priority_support",
    ],
  },

  team: {
    id: "team",
    name: "Team",
    monthlyPrice: 18.99,
    maxProjects: 5,
    maxBusinessManagersTotal: 10,
    maxBusinessManagersPerProject: 2,
    maxAdAccountsTotal: 20,
    maxAdAccountsPerBusinessManager: 2,
    syncMode: "priority",
    decisionEngineLevel: "advanced",
    supportLevel: "standard",
    features: [
      "dashboard",
      "meta_ads_overview",
      "meta_ads_diagnosis",
      "utm_generator",
      "sales_manual",
      "sales_full_attribution",
      "data_sources_full",
      "shopify",
      "google_sheets",
      "manual_orders",
      "auto_sync",
      "priority_sync",
      "decision_engine_basic",
      "decision_engine_full",
      "revenue_operations",
    ],
    lockedFeatures: [
      "multi_project_operations",
      "priority_support",
    ],
  },

  scale: {
    id: "scale",
    name: "Scale",
    monthlyPrice: 49.99,
    maxProjects: 15,
    maxBusinessManagersTotal: 45,
    maxBusinessManagersPerProject: 3,
    maxAdAccountsTotal: 225,
    maxAdAccountsPerBusinessManager: 5,
    syncMode: "priority",
    decisionEngineLevel: "premium",
    supportLevel: "priority",
    features: [
      "dashboard",
      "meta_ads_overview",
      "meta_ads_diagnosis",
      "utm_generator",
      "sales_manual",
      "sales_full_attribution",
      "data_sources_full",
      "shopify",
      "google_sheets",
      "manual_orders",
      "auto_sync",
      "priority_sync",
      "decision_engine_basic",
      "decision_engine_full",
      "revenue_operations",
      "multi_project_operations",
      "priority_support",
    ],
    lockedFeatures: [],
  },
};

export const PLAN_IDS: PlanId[] = ["starter", "operator", "team", "scale"];

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid";

export function isActiveStatus(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

export type AddonId =
  | "extraProjectPackage"
  | "extraProjectBusinessManager"
  | "extraProjectAdAccount"
  | "existingProjectBusinessManager"
  | "existingProjectAdAccount";

export type Addon = {
  id: AddonId;
  label: string;
  priceMonthly: number;
  includes: {
    projects?: number;
    businessManagers?: number;
    adAccounts?: number;
  };
};

export const ADDONS: Record<AddonId, Addon> = {
  extraProjectPackage: {
    id: "extraProjectPackage",
    label: "Extra Project Package",
    priceMonthly: 15,
    includes: { projects: 1, businessManagers: 1, adAccounts: 1 },
  },
  extraProjectBusinessManager: {
    id: "extraProjectBusinessManager",
    label: "Extra BM inside extra project",
    priceMonthly: 7,
    includes: { businessManagers: 1, adAccounts: 1 },
  },
  extraProjectAdAccount: {
    id: "extraProjectAdAccount",
    label: "Extra Ad Account inside extra project",
    priceMonthly: 3,
    includes: { adAccounts: 1 },
  },
  existingProjectBusinessManager: {
    id: "existingProjectBusinessManager",
    label: "Extra BM inside existing project",
    priceMonthly: 10,
    includes: { businessManagers: 1, adAccounts: 1 },
  },
  existingProjectAdAccount: {
    id: "existingProjectAdAccount",
    label: "Extra Ad Account inside existing project",
    priceMonthly: 5,
    includes: { adAccounts: 1 },
  },
};

export type AddonCounts = Record<AddonId, number>;

export const EMPTY_ADDON_COUNTS: AddonCounts = {
  extraProjectPackage: 0,
  extraProjectBusinessManager: 0,
  extraProjectAdAccount: 0,
  existingProjectBusinessManager: 0,
  existingProjectAdAccount: 0,
};
