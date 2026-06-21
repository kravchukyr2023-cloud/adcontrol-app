import "server-only";

export const SHOPIFY_API_VERSION = "2024-01";

export class ShopifyError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ShopifyError";
    this.status = status;
  }
}

export class ShopifyAuthError extends ShopifyError {
  constructor(message: string) {
    super(message, 401);
    this.name = "ShopifyAuthError";
  }
}

export class ShopifyNotFoundError extends ShopifyError {
  constructor(message: string) {
    super(message, 404);
    this.name = "ShopifyNotFoundError";
  }
}

export class ShopifyRateLimitError extends ShopifyError {
  constructor(message: string) {
    super(message, 429);
    this.name = "ShopifyRateLimitError";
  }
}

/**
 * Accepts the variety of formats users paste from the Shopify admin URL bar
 * (with/without protocol, trailing slash, /admin path, etc.) and returns the
 * canonical `xxx.myshopify.com` hostname. Throws if the input isn't a
 * myshopify.com store domain — we don't support custom domains since the
 * Admin API is only addressable through the myshopify hostname.
 */
export function normalizeShopUrl(input: string): string {
  if (typeof input !== "string") {
    throw new ShopifyError("Shop URL must be a string");
  }
  let raw = input.trim().toLowerCase();
  if (!raw) {
    throw new ShopifyError("Shop URL is required");
  }

  raw = raw.replace(/^https?:\/\//, "");
  raw = raw.split("/")[0];
  raw = raw.replace(/\/+$/g, "");

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(raw)) {
    throw new ShopifyError(
      "Shop URL must be in the form yourstore.myshopify.com"
    );
  }
  return raw;
}

export async function shopifyFetch(
  shopUrl: string,
  token: string,
  endpoint: string,
  init?: RequestInit
): Promise<unknown> {
  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  const url = `https://${shopUrl}/admin/api/${SHOPIFY_API_VERSION}/${cleanEndpoint}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new ShopifyError(`Could not reach Shopify: ${msg}`);
  }

  let body: unknown = null;
  const text = await resp.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (resp.ok) {
    return body;
  }

  const detail = extractShopifyErrorMessage(body) ?? resp.statusText;

  if (resp.status === 401 || resp.status === 403) {
    throw new ShopifyAuthError(detail || "Invalid Shopify access token");
  }
  if (resp.status === 404) {
    throw new ShopifyNotFoundError(detail || "Shopify resource not found");
  }
  if (resp.status === 429) {
    throw new ShopifyRateLimitError(detail || "Shopify rate limit exceeded");
  }
  throw new ShopifyError(
    detail || `Shopify request failed (${resp.status})`,
    resp.status
  );
}

function extractShopifyErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.errors === "string") return b.errors;
  if (b.errors && typeof b.errors === "object") {
    try {
      return JSON.stringify(b.errors);
    } catch {
      return null;
    }
  }
  if (typeof b.error === "string") return b.error;
  return null;
}

/**
 * Probes the credentials by calling GET shop.json. Returns the shop's display
 * name so the UI can confirm the right store was connected. Maps HTTP status
 * to typed errors so the route can return precise 401/404/502 responses.
 */
export async function validateShopifyConnection(
  shopUrl: string,
  token: string
): Promise<{ shopName: string }> {
  const data = (await shopifyFetch(shopUrl, token, "shop.json")) as
    | { shop?: { name?: string } }
    | null;

  const name = data?.shop?.name;
  if (!name) {
    throw new ShopifyError("Shopify shop.json returned no shop name");
  }
  return { shopName: name };
}
