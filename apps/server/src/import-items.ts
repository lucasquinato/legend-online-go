import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { projectRoot } from "./config.js";
const db = new DatabaseSync(join(projectRoot, "data/state.sqlite"), {
  readOnly: true,
});
const row = db
  .prepare("SELECT sha256 FROM assets WHERE path='/xml/tempinfos.xml'")
  .get()!;
const xml = inflateSync(
  readFileSync(
    join(projectRoot, `data/assets/objects/${row.sha256}.bin`),
  ).subarray(4),
).toString("utf8");
const items: Record<string, Record<string, string>> = {};
const entities: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};
for (const match of xml.matchAll(/<ItemTempInfo\s+([^>]+)\/>/g)) {
  const attributes = Object.fromEntries(
    [...match[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [
      m[1]!,
      m[2]!.replace(/&(amp|quot|apos|lt|gt);/g, (_, k) => entities[k]!),
    ]),
  );
  items[attributes.TemplateId!] = attributes;
}
if (!Object.keys(items).length) throw new Error("Tabela de itens vazia");
writeFileSync(
  join(projectRoot, "reference/item-templates.json"),
  JSON.stringify({
    source: { path: "/xml/tempinfos.xml", sha256: row.sha256 },
    items,
  }),
);
db.close();
console.log(JSON.stringify({ imported: Object.keys(items).length }));
