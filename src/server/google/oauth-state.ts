import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { requireEnv } from "@/server/env";

/**
 * Google OAuth state.
 *
 * Unlike the Meta flow (which stores the state in an HttpOnly cookie because
 * the payload is a random nonce), Google needs to round-trip the
 * project_id so the callback knows which sales_sources row to upsert. We
 * therefore embed the payload directly in the `state` query param and sign
 * it with HMAC-SHA256.
 *
 * Format: `base64url(JSON({projectId,userId,ts})).hex(sig)`
 *
 * The HMAC secret is reused from META_OAUTH_STATE_SECRET — the Meta state
 * format is `nonce.timestamp` (no base64 payload), so the two state
 * encodings cannot be confused on the wire.
 */

const TTL_MS = 10 * 60 * 1000;

function getSecret(): string {
  return requireEnv("META_OAUTH_STATE_SECRET");
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(
    s.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  ).toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type GoogleStatePayload = {
  projectId: string;
  userId: string;
  ts: number;
};

export function signGoogleState(input: {
  projectId: string;
  userId: string;
}): string {
  const payload: GoogleStatePayload = {
    projectId: input.projectId,
    userId: input.userId,
    ts: Date.now(),
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyGoogleState(state: string): GoogleStatePayload | null {
  if (typeof state !== "string" || state.length === 0) return null;

  const parts = state.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expected = sign(encoded);
  if (!safeEqual(signature, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(encoded));
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as GoogleStatePayload).projectId !== "string" ||
    typeof (parsed as GoogleStatePayload).userId !== "string" ||
    typeof (parsed as GoogleStatePayload).ts !== "number"
  ) {
    return null;
  }

  const payload = parsed as GoogleStatePayload;
  const age = Date.now() - payload.ts;
  if (!Number.isFinite(age) || age < 0 || age > TTL_MS) return null;

  return payload;
}
