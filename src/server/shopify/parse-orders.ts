import "server-only";
import type { ParsedOrder } from "@/server/sheets/parse-rows";
import type {
  ShopifyCustomer,
  ShopifyLineItem,
  ShopifyOrder,
} from "@/server/shopify/fetch-orders";

/**
 * Maps Shopify Admin API orders into our internal ParsedOrder shape — the
 * same type Google Sheets parsing emits, so the shared upsertOrders can splat
 * either source without branching.
 *
 * UTM extraction precedence (S2 stores tag orders inconsistently):
 *   1. `note_attributes` — Shopify's first-class key/value bag; popular
 *      checkout-customization apps (Custom Pixel, Littledata, etc.) write
 *      utm_* there.
 *   2. `landing_site` — raw query string of the first page the customer
 *      hit. Parsed via URLSearchParams; if the URL is malformed we silently
 *      skip (one bad row should not poison the batch).
 *   3. Otherwise UTM fields are null → order lands as `unmatched`, which is
 *      a valid attribution outcome.
 */

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type UtmKey = (typeof UTM_KEYS)[number];

type Utm = Record<UtmKey, string | null>;

export type ShopifyParseError = {
  /** Shopify order id (numeric, or "unknown" if missing). */
  orderId: string;
  reason: string;
};

export type ShopifyParseResult = {
  valid: ParsedOrder[];
  errors: ShopifyParseError[];
};

const DEFAULT_CURRENCY = "USD";

export function parseShopifyOrders(
  orders: ShopifyOrder[]
): ShopifyParseResult {
  const valid: ParsedOrder[] = [];
  const errors: ShopifyParseError[] = [];

  for (const order of orders) {
    const orderIdLabel =
      typeof order?.id === "number" ? String(order.id) : "unknown";

    if (!order || typeof order !== "object") {
      errors.push({ orderId: orderIdLabel, reason: "Empty order payload" });
      continue;
    }

    // external_id: prefer `name` (the human-facing "#1001") since that's what
    // merchants see in Shopify admin. Fall back to numeric id otherwise.
    const externalId =
      (typeof order.name === "string" && order.name.trim()) ||
      (typeof order.id === "number" ? String(order.id) : "");
    if (!externalId) {
      errors.push({ orderId: orderIdLabel, reason: "Missing order identifier" });
      continue;
    }

    const orderDate = parseOrderDate(order.created_at);
    if (!orderDate) {
      errors.push({
        orderId: orderIdLabel,
        reason: `Invalid created_at '${order.created_at ?? ""}'`,
      });
      continue;
    }

    const revenue = parseMoney(order.total_price);
    if (revenue === null) {
      errors.push({
        orderId: orderIdLabel,
        reason: `Invalid total_price '${order.total_price ?? ""}'`,
      });
      continue;
    }
    if (revenue < 0) {
      errors.push({
        orderId: orderIdLabel,
        reason: `Negative total_price '${order.total_price ?? ""}'`,
      });
      continue;
    }

    const currency = parseCurrency(order.currency);
    const customerName = buildCustomerName(order.customer);
    const customerEmail =
      stringOrNull(order.customer?.email) ?? stringOrNull(order.email);
    const productName = buildProductName(order.line_items);
    const utm = extractUtm(order);

    valid.push({
      order_date: orderDate,
      order_external_id: externalId,
      customer_name: customerName,
      customer_email: customerEmail,
      product_name: productName,
      revenue,
      currency,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
    });
  }

  return { valid, errors };
}

/**
 * Pulls UTM tags from a Shopify order. Exposed (not internal) so future
 * sources of UTM (e.g. cart-attributes, app-injected fields) can be plugged
 * in by extending the precedence list here without touching parseShopifyOrders.
 */
export function extractUtm(order: ShopifyOrder): Utm {
  const fromAttrs = readUtmFromNoteAttributes(order.note_attributes);
  if (anyPresent(fromAttrs)) return fromAttrs;

  const fromLanding = readUtmFromUrl(order.landing_site);
  if (anyPresent(fromLanding)) return fromLanding;

  return emptyUtm();
}

function readUtmFromNoteAttributes(
  attrs: ShopifyOrder["note_attributes"]
): Utm {
  const out = emptyUtm();
  if (!Array.isArray(attrs)) return out;

  for (const a of attrs) {
    const rawName = typeof a?.name === "string" ? a.name.trim().toLowerCase() : "";
    if (!isUtmKey(rawName)) continue;
    const value = stringOrNull(a?.value);
    if (value) out[rawName] = value;
  }
  return out;
}

function readUtmFromUrl(url: string | null | undefined): Utm {
  const out = emptyUtm();
  if (typeof url !== "string" || !url) return out;

  let parsed: URL;
  try {
    // Shopify sometimes stores just the path+query ("/?utm_source=foo"),
    // sometimes a full URL. URL() needs an absolute base for the relative
    // case — give it a throwaway origin so the search params still parse.
    parsed = url.startsWith("http")
      ? new URL(url)
      : new URL(url, "https://shopify.invalid");
  } catch {
    return out;
  }

  for (const key of UTM_KEYS) {
    const v = parsed.searchParams.get(key);
    if (v && v.trim()) out[key] = v.trim();
  }
  return out;
}

function emptyUtm(): Utm {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
  };
}

function anyPresent(u: Utm): boolean {
  return UTM_KEYS.some((k) => u[k] !== null);
}

function isUtmKey(name: string): name is UtmKey {
  return (UTM_KEYS as readonly string[]).includes(name);
}

function parseOrderDate(raw: string | undefined | null): string | null {
  if (typeof raw !== "string" || !raw) return null;
  // Shopify created_at is ISO 8601 with timezone. We store the calendar date
  // in UTC to match how Google Sheets dates land (date-only, no zone).
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${y.toString().padStart(4, "0")}-${pad(m)}-${pad(day)}`;
}

function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === "string" ? raw : String(raw);
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseCurrency(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CURRENCY;
  const t = raw.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(t)) return t;
  return DEFAULT_CURRENCY;
}

function buildCustomerName(c: ShopifyCustomer | null | undefined): string | null {
  if (!c) return null;
  const first = stringOrNull(c.first_name);
  const last = stringOrNull(c.last_name);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined === "" ? null : joined;
}

function buildProductName(items: ShopifyLineItem[] | undefined): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  const title =
    stringOrNull(first?.title) ?? stringOrNull(first?.name) ?? null;
  if (items.length === 1) return title;
  if (title) return `${title} (+${items.length - 1} more)`;
  return `${items.length} items`;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  }
  const t = v.trim();
  return t === "" ? null : t;
}

