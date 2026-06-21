import "server-only";
import {
  SHOPIFY_API_VERSION,
  ShopifyAuthError,
  ShopifyError,
  ShopifyNotFoundError,
  ShopifyRateLimitError,
} from "@/lib/shopify/client";

/**
 * Reads orders from the Shopify Admin API with cursor pagination.
 *
 * The Admin API returns up to 250 orders per page and signals "more available"
 * via the `Link` header with `rel="next"`. We follow the cursor and cap at
 * MAX_PAGES so a misconfigured store can't keep us looping past the Hobby
 * function timeout — the cap surfaces as `truncated: true` to the caller.
 *
 * We do the fetch inline here (not via `shopifyFetch`) because the wrapper
 * only exposes the JSON body, and pagination needs the response headers.
 */

const MAX_PAGES = 10;
const PAGE_SIZE = 250;

export type ShopifyMoney = string;

export type ShopifyLineItem = {
  id?: number;
  title?: string;
  name?: string;
  quantity?: number;
};

export type ShopifyNoteAttribute = {
  name?: string;
  value?: string | number | null;
};

export type ShopifyCustomer = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

export type ShopifyOrder = {
  id: number;
  name?: string;
  order_number?: number;
  created_at: string;
  total_price?: ShopifyMoney;
  currency?: string;
  customer?: ShopifyCustomer | null;
  line_items?: ShopifyLineItem[];
  note_attributes?: ShopifyNoteAttribute[];
  landing_site?: string | null;
  referring_site?: string | null;
  email?: string | null;
};

export type FetchShopifyOrdersResult = {
  orders: ShopifyOrder[];
  /** True if we stopped pagination at MAX_PAGES with more pages still available. */
  truncated: boolean;
  /** Number of pages fetched (1-based). */
  pages: number;
};

export async function fetchShopifyOrders(params: {
  shopUrl: string;
  accessToken: string;
  since?: string | null;
}): Promise<FetchShopifyOrdersResult> {
  const { shopUrl, accessToken, since } = params;

  const baseUrl = new URL(
    `https://${shopUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json`
  );
  baseUrl.searchParams.set("status", "any");
  baseUrl.searchParams.set("limit", String(PAGE_SIZE));
  if (since && since.trim()) {
    baseUrl.searchParams.set("created_at_min", since);
  }

  const orders: ShopifyOrder[] = [];
  let url: string | null = baseUrl.toString();
  let pages = 0;
  let truncated = false;

  while (url && pages < MAX_PAGES) {
    const { body, linkNext } = await getPage(url, accessToken);
    pages += 1;

    const pageOrders = Array.isArray(body?.orders) ? body!.orders : [];
    orders.push(...pageOrders);

    url = linkNext;
  }

  if (url) {
    // Loop exited because of MAX_PAGES, not because there was no next.
    truncated = true;
  }

  return { orders, truncated, pages };
}

async function getPage(
  url: string,
  accessToken: string
): Promise<{ body: { orders?: ShopifyOrder[] } | null; linkNext: string | null }> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new ShopifyError(`Could not reach Shopify: ${msg}`);
  }

  const text = await resp.text();
  let body: { orders?: ShopifyOrder[] } | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as { orders?: ShopifyOrder[] };
    } catch {
      body = null;
    }
  }

  if (!resp.ok) {
    const detail = extractError(body) ?? resp.statusText;
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

  const linkNext = parseNextLink(resp.headers.get("link"));
  return { body, linkNext };
}

/**
 * Shopify's Link header looks like:
 *   <https://shop.myshopify.com/admin/api/2024-01/orders.json?...&page_info=...>; rel="next"
 *   (optionally preceded by a `rel="previous"` link, comma-separated)
 * Returns the URL for `rel="next"` or null if missing.
 */
function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",");
  for (const part of parts) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part.trim());
    if (m) return m[1];
  }
  return null;
}

function extractError(body: unknown): string | null {
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
