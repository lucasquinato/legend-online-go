import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { TitleCatalog } from "./catalog.js";
import type { TitleCatalogInput } from "./types.js";

// Runtime is entirely backend-owned. Never reads recovered files from the client.
export const titleCatalog = new TitleCatalog(JSON.parse(
  readFileSync(join(projectRoot, "reference/titles/content.json"), "utf8"),
) as TitleCatalogInput);
