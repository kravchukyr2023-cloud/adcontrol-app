import "server-only";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleSheetsAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleSheetsAuthError";
    this.status = status;
  }
}

export class GoogleSheetsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsNotFoundError";
  }
}

export class GoogleSheetsForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsForbiddenError";
  }
}

async function googleGet(
  url: string,
  accessToken: string,
  context: string
): Promise<unknown> {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (resp.ok) return resp.json();

  const body = await resp.text();
  if (resp.status === 401) {
    throw new GoogleSheetsAuthError(
      `${context}: token expired or invalid (401): ${body}`,
      401
    );
  }
  if (resp.status === 403) {
    throw new GoogleSheetsForbiddenError(
      `${context}: access denied (403). Verify the spreadsheet is shared with the connected Google account: ${body}`
    );
  }
  if (resp.status === 404) {
    throw new GoogleSheetsNotFoundError(
      `${context}: spreadsheet not found (404). It may have been deleted or moved: ${body}`
    );
  }
  throw new Error(`${context}: HTTP ${resp.status}: ${body}`);
}

export type DriveSpreadsheet = { id: string; name: string };

export async function listUserSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheet[]> {
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set(
    "q",
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "100");

  const data = (await googleGet(
    url.toString(),
    accessToken,
    "listUserSpreadsheets"
  )) as { files?: Array<{ id: string; name: string }> };

  return (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

function encodeRange(sheetName: string | undefined, a1: string): string {
  // Sheets v4 expects the range in the URL path, e.g. "Sheet1!A2:L".
  // Wrap sheet names that contain spaces/special chars in single quotes,
  // doubling any embedded quotes — matches Google's own A1 escape rules.
  if (!sheetName) return encodeURIComponent(a1);
  const escaped = sheetName.replace(/'/g, "''");
  const needsQuotes = /[^A-Za-z0-9_]/.test(sheetName);
  const ref = needsQuotes ? `'${escaped}'` : escaped;
  return encodeURIComponent(`${ref}!${a1}`);
}

export async function getSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  sheetName?: string
): Promise<string[]> {
  const range = encodeRange(sheetName, "1:1");
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}`;

  const data = (await googleGet(
    url,
    accessToken,
    "getSheetHeaders"
  )) as { values?: string[][] };

  const row = data.values?.[0] ?? [];
  return row.map((c) => (c ?? "").toString());
}

export async function getSheetRows(
  accessToken: string,
  spreadsheetId: string,
  sheetName?: string
): Promise<string[][]> {
  // A2:L — start from row 2 (skip headers), up to column L (12th column = 12 fields).
  const range = encodeRange(sheetName, "A2:L");
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}`;

  const data = (await googleGet(
    url,
    accessToken,
    "getSheetRows"
  )) as { values?: string[][] };

  return (data.values ?? []).map((row) =>
    row.map((c) => (c ?? "").toString())
  );
}
