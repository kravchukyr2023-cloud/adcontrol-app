import "server-only";

/**
 * Row parser for the 12-column Google Sheets template enforced by
 * /api/google/sheets/select.
 *
 * Column index → semantic field (must match EXPECTED_COLUMNS in the
 * select route):
 *   0  date
 *   1  order_id
 *   2  customer_name
 *   3  customer_email
 *   4  product
 *   5  revenue
 *   6  currency
 *   7  utm_source
 *   8  utm_medium
 *   9  utm_campaign
 *  10  utm_content
 *  11  utm_term
 *
 * Returned ParsedOrder maps DB column names (matches the `orders`
 * table layout), so the upserter can splat directly.
 */

export type ParsedOrder = {
  order_date: string; // ISO YYYY-MM-DD
  order_external_id: string;
  customer_name: string | null;
  customer_email: string | null;
  product_name: string | null;
  revenue: number;
  currency: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

export type RowError = {
  /** 1-based row number as it appears in the sheet (header is row 1, first data row is row 2). */
  rowIndex: number;
  reason: string;
};

export type ParseResult = {
  valid: ParsedOrder[];
  errors: RowError[];
};

const DEFAULT_CURRENCY = "USD";

/**
 * @param rows rows starting from row 2 in the sheet (data only — header
 *             was already validated by the /select route).
 */
export function parseSheetRows(rows: string[][]): ParseResult {
  const valid: ParsedOrder[] = [];
  const errors: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2; // header is row 1, first data row is row 2
    const row = rows[i] ?? [];

    if (isBlankRow(row)) continue;

    const dateRaw = cell(row, 0);
    const orderId = cell(row, 1).trim();
    const customerName = nullable(cell(row, 2));
    const customerEmail = nullable(cell(row, 3));
    const product = nullable(cell(row, 4));
    const revenueRaw = cell(row, 5);
    const currencyRaw = cell(row, 6);
    const utmSource = nullable(cell(row, 7));
    const utmMedium = nullable(cell(row, 8));
    const utmCampaign = nullable(cell(row, 9));
    const utmContent = nullable(cell(row, 10));
    const utmTerm = nullable(cell(row, 11));

    const orderDate = parseDate(dateRaw);
    if (!orderDate) {
      errors.push({
        rowIndex: sheetRow,
        reason: `Invalid date '${dateRaw.trim()}' (expected YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, or MM/DD/YYYY)`,
      });
      continue;
    }

    if (!orderId) {
      errors.push({ rowIndex: sheetRow, reason: "Missing order_id" });
      continue;
    }

    const revenue = parseRevenue(revenueRaw);
    if (revenue === null) {
      errors.push({
        rowIndex: sheetRow,
        reason: `Invalid revenue '${revenueRaw.trim()}'`,
      });
      continue;
    }
    if (revenue < 0) {
      errors.push({
        rowIndex: sheetRow,
        reason: `Negative revenue '${revenueRaw.trim()}'`,
      });
      continue;
    }

    const currency = parseCurrency(currencyRaw);

    valid.push({
      order_date: orderDate,
      order_external_id: orderId,
      customer_name: customerName,
      customer_email: customerEmail,
      product_name: product,
      revenue,
      currency,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
    });
  }

  return { valid, errors };
}

function cell(row: string[], i: number): string {
  return (row[i] ?? "").toString();
}

function nullable(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => !c || c.trim() === "");
}

/**
 * Accepts ISO (`YYYY-MM-DD[Tetc]`), EU dot (`DD.MM.YYYY`), and slash
 * (`DD/MM/YYYY` or `MM/DD/YYYY`).
 *
 * For slash format the components are ambiguous between European and US
 * conventions. Heuristic:
 *   - if the first part is > 12 it must be the day → DD/MM
 *   - if the second part is > 12 it must be the day → MM/DD
 *   - otherwise (both ≤ 12) default to DD/MM (European bias)
 *
 * Returns the date as `YYYY-MM-DD` or `null` if the string cannot be parsed
 * into a valid calendar date.
 */
function parseDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  // ISO YYYY-MM-DD (allow trailing time component, e.g. exports from Sheets).
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(t);
  if (m) return buildIso(+m[1], +m[2], +m[3]);

  // EU dot DD.MM.YYYY
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return buildIso(+m[3], +m[2], +m[1]);

  // Slash DD/MM/YYYY or MM/DD/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (a > 12 && b <= 12) return buildIso(y, b, a); // DD/MM
    if (b > 12 && a <= 12) return buildIso(y, a, b); // MM/DD
    return buildIso(y, b, a); // ambiguous → default to DD/MM
  }

  return null;
}

function buildIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Round-trip through UTC Date to catch impossible dates like Feb 30.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${y.toString().padStart(4, "0")}-${pad(m)}-${pad(d)}`;
}

/**
 * Parses revenue across locale variants: US (`1,200.50`), EU dot-as-thousands
 * (`1.200,50`), comma decimal (`1200,50`), dot decimal (`1200.50`), and
 * stray currency symbols / spaces.
 *
 * Algorithm:
 *   1. Strip everything except digits, `.`, `,`, `-`.
 *   2. If BOTH separators present → rightmost is the decimal, the other is
 *      a thousands grouper.
 *   3. If only ONE separator present → it's a decimal iff it's followed by
 *      exactly 1 or 2 digits, otherwise it's a thousands grouper.
 */
function parseRevenue(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;

  const cleaned = t.replace(/[^\d.,-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") {
    return null;
  }

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      normalized = cleaned.replace(/,/g, "");
    } else {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
  } else {
    const idx = lastDot >= 0 ? lastDot : lastComma;
    const afterDigits = cleaned.length - idx - 1;
    if (afterDigits >= 1 && afterDigits <= 2) {
      normalized = lastDot >= 0 ? cleaned : cleaned.replace(",", ".");
    } else {
      normalized = cleaned.replace(/[.,]/g, "");
    }
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Per spec, an invalid currency is NOT fatal — we silently default to USD.
 * Acceptable input: exactly three ASCII letters (case-insensitive). Anything
 * else → USD.
 */
function parseCurrency(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(t)) return t;
  return DEFAULT_CURRENCY;
}
