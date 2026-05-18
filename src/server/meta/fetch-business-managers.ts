import "server-only";
import { META_GRAPH_BASE } from "./meta-config";

export type MetaBM = {
  id: string;
  name: string;
};

export async function fetchBusinessManagers(
  token: string
): Promise<MetaBM[]> {
  const url = new URL(`${META_GRAPH_BASE}/me/businesses`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);

  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Meta /me/businesses failed: ${body}`);
  }

  const data = (await resp.json()) as {
    data?: Array<{ id: string; name: string }>;
  };

  return (data.data ?? []).map((b) => ({ id: b.id, name: b.name }));
}
