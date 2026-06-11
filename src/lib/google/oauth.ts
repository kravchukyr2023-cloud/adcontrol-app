import "server-only";
import { requireEnv } from "@/server/env";

// Hardcoded Google OAuth 2.0 endpoints — pinned per spec so the bundle
// doesn't pull `googleapis` and we don't depend on a remote discovery doc.
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const DEFAULT_REDIRECT_URI =
  "https://adcontrol-app.vercel.app/api/google/oauth/callback";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function getGoogleRedirectUri(): string {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? DEFAULT_REDIRECT_URI
  );
}

export function getGoogleClientId(): string {
  return requireEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret(): string {
  return requireEnv("GOOGLE_CLIENT_SECRET");
}

export function getGoogleAuthUrl(state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", getGoogleClientId());
  url.searchParams.set("redirect_uri", getGoogleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  // access_type=offline + prompt=consent: Google ONLY returns a refresh_token
  // when the user is shown the consent screen (offline access). If we skip
  // prompt=consent and the user has previously granted access, we get an
  // access_token with no refresh_token — that breaks long-lived sync.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export type GoogleTokenExchangeResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
};

export async function exchangeGoogleCode(
  code: string
): Promise<GoogleTokenExchangeResult> {
  const body = new URLSearchParams({
    code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: getGoogleRedirectUri(),
    grant_type: "authorization_code",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };

  if (!data.access_token) {
    throw new Error("Google token response missing access_token");
  }
  if (!data.refresh_token) {
    // Without refresh_token we can't survive past the ~1h access_token TTL.
    // The auth URL forces prompt=consent precisely to avoid this; if we still
    // see it, treat as a hard failure and ask the user to revoke + retry.
    throw new Error(
      "Google token response missing refresh_token — the user may need to revoke previous access at https://myaccount.google.com/permissions and reconnect."
    );
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : 3600,
    id_token: data.id_token,
  };
}

export type GoogleTokenRefreshResult = {
  access_token: string;
  expires_in: number;
};

export async function refreshGoogleToken(
  refreshToken: string
): Promise<GoogleTokenRefreshResult> {
  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    // 400 invalid_grant means refresh_token revoked/expired — caller marks
    // the sales_source as 'error' so the UI can prompt for reconnect.
    throw new Error(
      `Google token refresh failed (${resp.status}): ${text}`
    );
  }

  const data = (await resp.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Google token refresh response missing access_token");
  }

  return {
    access_token: data.access_token,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : 3600,
  };
}

export type GoogleUserInfo = {
  email: string;
  sub: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
};

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google userinfo failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as GoogleUserInfo;
}
