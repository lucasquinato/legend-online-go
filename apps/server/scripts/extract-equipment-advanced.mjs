import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const sha256 = "3cf327b92ca79b3393336e7f8762968a79a59cf6544ca0c3dba71caf78b1ec77";
const data = inflateSync(readFileSync(`data/assets/objects/${sha256}.bin`).subarray(4)), tables = {};
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
let pos = 4;
while (pos < data.length) {
  const n = data[pos++], name = data.subarray(pos, pos + n).toString(); pos += n;
  const size = data.readUInt32BE(pos); pos += 4;
  const xml = data.subarray(pos, pos + size).toString(); pos += size;
  tables[name.toLowerCase()] = [...xml.matchAll(/<\w+\s+[^>]*\/>/g)].map(([row]) => Object.fromEntries([...row.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)])));
}
const items = Object.values(JSON.parse(readFileSync("reference/item-templates.json")).items).filter(t => [117,118].includes(Number(t.SonType)));
const ids = new Set(items.map(t => t.TemplateId)), pools = new Set(items.map(t => t.Property7));
const skills = tables.skilltempinfos.filter(s => pools.has(s.MasterType)), skillIds = new Set(skills.map(s => s.TemplateId));
const result = { source: { path: "/xml/tempinfos.xml", sha256 }, items: items.map(t => Number(t.TemplateId)), recipes: tables.composetempinfos.filter(r => ids.has(r.NewMaterial)), skills, properties: tables.skillpropertytempinfos.filter(p => skillIds.has(p.TemplateId)), upgrades: tables.upgradetempinfos.filter(r => r.Types === "117") };
if (result.items.length !== 16 || result.recipes.length !== 16 || result.upgrades.length !== 101 || !skills.length || result.properties.length !== skills.length) throw new Error("Tabelas avançadas incompletas");
writeFileSync("reference/equipment/advanced.json", JSON.stringify(result, null, 2) + "\n");
console.log({ items: result.items.length, recipes: result.recipes.length, skills: skills.length, upgrades: result.upgrades.length });
