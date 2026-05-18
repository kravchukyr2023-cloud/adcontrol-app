import "server-only";
import { META_GRAPH_BASE } from "./meta-config";

export type MetaUser = {
  id: string;
  name: string | null;
};

export async function fetchMetaUser(token: string): Promise<MetaUser> {
  const url = new URL(`${META_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", token);

  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Meta /me failed: ${body}`);
  }

  const data = (await resp.json()) as { id?: string; name?: string };
  if (!data.id) throw new Error("Meta /me response missing id");

  return { id: data.id, name: data.name ?? null };
}
