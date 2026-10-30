import type { Asset, AssetCache } from "../../assets.js";
import { templates } from "./content.js";
const normalize = (path: string) => path.toLowerCase().replace(/\/+/g, "/").replace(/_[a-f0-9]{8}(?=\.)/g, "");
/** Icon aliases only; executable UI modules remain under the release-lock contract. */
export async function cosmosIconResource(cache: AssetCache, path: string): Promise<Asset | undefined> {
  const normalized = normalize(path), match = normalized.match(/^\/cdn\/icon\/star\/(\d+)\.swf$/);
  if (!match || !templates.has(Number(match[1]))) return;
  const rows = cache.list().filter(asset => normalize(asset.path) === normalized).sort((a,b) => Number(b.path === path) - Number(a.path === path) || b.saved_at.localeCompare(a.saved_at));
  for (const asset of rows) if (await cache.verify(asset)) return asset;
}
