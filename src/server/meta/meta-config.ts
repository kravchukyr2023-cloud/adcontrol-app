import "server-only";

export const META_GRAPH_API_VERSION = "v18.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`;

export const META_SCOPES = [
  "business_management",
  "ads_read",
];

export function getMetaAppId(): string {
  const v = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!v) throw new Error("Missing NEXT_PUBLIC_META_APP_ID");
  return v;
}

export function getMetaAppSecret(): string {
  const v = process.env.META_APP_SECRET;
  if (!v) throw new Error("Missing META_APP_SECRET");
  return v;
}

export function getRedirectUri(): string {
  const v = process.env.NEXT_PUBLIC_META_REDIRECT_URI;
  if (!v) throw new Error("Missing NEXT_PUBLIC_META_REDIRECT_URI");
  return v;
}

export function getStateSecret(): string {
  const v = process.env.META_OAUTH_STATE_SECRET;
  if (!v) throw new Error("Missing META_OAUTH_STATE_SECRET");
  return v;
}
