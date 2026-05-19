import "server-only";
import { requireEnv } from "@/server/env";

export const META_GRAPH_API_VERSION = "v22.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`;

export const META_SCOPES = [
  "business_management",
  "ads_read",
];

/**
 * Effective OAuth scopes for the current environment.
 *
 * Production: returns META_SCOPES (business_management + ads_read).
 * Local dev: if META_OAUTH_SCOPES is set in .env.local, returns those
 * instead — lets you verify the OAuth roundtrip with scopes that don't
 * require App Review (e.g. public_profile,email) before your real app
 * is approved by Meta.
 */
export function getMetaScopes(): string[] {
  const override = process.env.META_OAUTH_SCOPES;
  if (!override) return META_SCOPES;

  const parsed = override
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return parsed.length > 0 ? parsed : META_SCOPES;
}

export function getMetaAppId(): string {
  return requireEnv("NEXT_PUBLIC_META_APP_ID");
}

export function getMetaAppSecret(): string {
  return requireEnv("META_APP_SECRET");
}

export function getRedirectUri(): string {
  return requireEnv("NEXT_PUBLIC_META_REDIRECT_URI");
}

export function getStateSecret(): string {
  return requireEnv("META_OAUTH_STATE_SECRET");
}
