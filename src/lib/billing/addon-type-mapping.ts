import { AddonId } from "@/config/plans";

export const ADDON_ID_TO_DB: Record<AddonId, string> = {
  extraProjectPackage: "extra_project_package",
  extraProjectBusinessManager: "extra_project_business_manager",
  extraProjectAdAccount: "extra_project_ad_account",
  existingProjectBusinessManager: "existing_project_business_manager",
  existingProjectAdAccount: "existing_project_ad_account",
};

const DB_TO_ADDON_ID: Record<string, AddonId> = {
  extra_project_package: "extraProjectPackage",
  extra_project_business_manager: "extraProjectBusinessManager",
  extra_project_ad_account: "extraProjectAdAccount",
  existing_project_business_manager: "existingProjectBusinessManager",
  existing_project_ad_account: "existingProjectAdAccount",
};

export function toAddonId(dbType: string): AddonId | null {
  return DB_TO_ADDON_ID[dbType] ?? null;
}

export function toDbAddonType(id: AddonId): string {
  return ADDON_ID_TO_DB[id];
}
