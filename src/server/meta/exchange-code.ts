import "server-only";
import {
  META_GRAPH_BASE,
  getMetaAppId,
  getMetaAppSecret,
  getRedirectUri,
} from "./meta-config";

type ShortTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type LongTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

/**
 * Exchange OAuth code → short-lived token → long-lived token (~60 days).
 * Returns the long-lived token and its expiration.
 */
export async function exchangeCodeForLongToken(
  code: string
): Promise<{ token: string; expiresAt: Date | null }> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const redirectUri = getRedirectUri();

  // Step 1: short-lived token
  const shortUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", appId);
  shortUrl.searchParams.set("client_secret", appSecret);
  shortUrl.searchParams.set("redirect_uri", redirectUri);
  shortUrl.searchParams.set("code", code);

  const shortResp = await fetch(shortUrl, { method: "GET" });
  if (!shortResp.ok) {
    const body = await shortResp.text();
    throw new Error(`Meta short-token exchange failed: ${body}`);
  }
  const shortData = (await shortResp.json()) as ShortTokenResponse;
  if (!shortData.access_token) {
    throw new Error("Meta short-token response missing access_token");
  }

  // Step 2: long-lived token
  const longUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortData.access_token);

  const longResp = await fetch(longUrl, { method: "GET" });
  if (!longResp.ok) {
    const body = await longResp.text();
    throw new Error(`Meta long-token exchange failed: ${body}`);
  }
  const longData = (await longResp.json()) as LongTokenResponse;
  if (!longData.access_token) {
    throw new Error("Meta long-token response missing access_token");
  }

  const expiresAt =
    typeof longData.expires_in === "number" && longData.expires_in > 0
      ? new Date(Date.now() + longData.expires_in * 1000)
      : null;

  return { token: longData.access_token, expiresAt };
}
