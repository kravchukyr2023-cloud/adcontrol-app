import "server-only";
import { META_GRAPH_BASE } from "./meta-config";

export type MetaAdAccount = {
  id: string;
  name: string;
  account_status: number | null;
  currency: string | null;
};

export async function fetchOwnedAdAccounts(
  bmId: string,
  token: string
): Promise<MetaAdAccount[]> {
  const url = new URL(`${META_GRAPH_BASE}/${bmId}/owned_ad_accounts`);
  url.searchParams.set("fields", "id,name,account_status,currency");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);

  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Meta /<bm>/owned_ad_accounts failed: ${body}`);
  }

  const data = (await resp.json()) as {
    data?: Array<{
      id: string;
      name: string;
      account_status?: number;
      currency?: string;
    }>;
  };

  return (data.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    account_status: a.account_status ?? null,
    currency: a.currency ?? null,
  }));
}
