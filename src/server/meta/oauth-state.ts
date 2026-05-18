import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getStateSecret } from "./meta-config";

const COOKIE_NAME = "meta_oauth_state";
const TTL_SECONDS = 600;

function sign(payload: string): string {
  return createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function setOAuthState(): Promise<string> {
  const nonce = randomBytes(32).toString("hex");
  const timestamp = Date.now().toString();
  const state = `${nonce}.${timestamp}`;
  const signature = sign(state);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${state}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_SECONDS,
    path: "/",
  });

  return state;
}

export async function verifyAndClearOAuthState(
  stateFromQuery: string
): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return false;

  cookieStore.delete(COOKIE_NAME);

  const parts = raw.split(".");
  if (parts.length !== 3) return false;

  const [nonce, timestamp, signature] = parts;
  const state = `${nonce}.${timestamp}`;

  if (!safeEqual(state, stateFromQuery)) return false;
  if (!safeEqual(sign(state), signature)) return false;

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > TTL_SECONDS * 1000) {
    return false;
  }

  return true;
}
