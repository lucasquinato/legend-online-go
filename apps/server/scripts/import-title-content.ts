import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { TitleCatalog, titleAttributeUnlock } from "../src/features/titles/catalog.js";
import type { RawTitleRow, TitleCatalogInput } from "../src/features/titles/types.js";

const bundlePath = "reference/quests/tempinfos.original.bin";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function xmlAttribute(value: string): string {
  // XML normalizes literal attribute whitespace before decoding character refs.
  return value.replace(/[\t\r\n]/g, " ").replace(/&([^;]+);/g, (_all, entity: string) => {
    const named: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };
    if (entity in named) return named[entity]!;
    if (/^#(?:\d+|x[\da-f]+)$/i.test(entity)) {
      const point = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)) return String.fromCodePoint(point);
    }
    throw new Error(`Entidade XML não suportada no acervo: &${entity};`);
  });
}

export function parseRows(bytes: Buffer): RawTitleRow[] {
  const text = bytes.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Declarações externas não são aceitas no acervo");
  return [...text.matchAll(/<\w+\s+([^>]*?)\/>/g)].map(match => {
    const row: Record<string, string> = {};
    for (const attr of match[1]!.matchAll(/(\w+)="([^"]*)"/g)) {
      if (Object.hasOwn(row, attr[1]!)) throw new Error("Atributo XML duplicado");
      row[attr[1]!] = xmlAttribute(attr[2]!);
    }
    return row;
  });
}

/** Offline extraction from the existing backend archive; no client/database/network access. */
export function prepareTitleCatalog(): TitleCatalogInput {
  const raw = readFileSync(join(projectRoot, bundlePath));
  const bytes = inflateSync(raw.subarray(4));
  const tables = new Map<string, { bytes: Buffer; rows: RawTitleRow[] }>();
  const required = new Set(["AppellInfos", "SkillPropertyTempInfos", "SkillTempInfos", "CampaignBufferTemps", "QuestTemps"]);
  let offset = 4;
  while (offset < bytes.length) {
    const length = bytes[offset++]!;
    if (length === 0 || offset + length + 4 > bytes.length) throw new Error("Índice do acervo truncado");
    const name = bytes.subarray(offset, offset + length).toString(); offset += length;
    const size = bytes.readUInt32BE(offset); offset += 4;
    if (offset + size > bytes.length) throw new Error(`Tabela truncada: ${name}`);
    if (required.has(name)) {
      if (tables.has(name)) throw new Error(`Tabela duplicada: ${name}`);
      const data = bytes.subarray(offset, offset + size);
      tables.set(name, { bytes: data, rows: parseRows(data) });
    }
    offset += size;
  }
  for (const name of required) if (!tables.has(name)) throw new Error(`Tabela ausente: ${name}`);
  const titles = tables.get("AppellInfos")!.rows;
  const references = (key: string) => new Set(titles.flatMap(t => (t[key] ?? "").split(",").filter(v => v && v !== "0")));
  const skills = references("Skills"), buffers = references("Buffs");
  const unlock = tables.get("QuestTemps")!.rows.find(row => Number(row.TemplateId) === titleAttributeUnlock.questId);
  if (Number(unlock?.NeedMinLevel) !== titleAttributeUnlock.originalMinimumLevel) throw new Error("Revisar o contrato de liberação dos atributos de títulos");
  const input: TitleCatalogInput = {
    version: 1,
    sources: {
      bundle: { path: bundlePath, sha256: sha(raw) },
      tables: [...tables].map(([name, value]) => ({ name, sha256: sha(value.bytes), rows: value.rows.length })),
    },
    titles,
    properties: tables.get("SkillPropertyTempInfos")!.rows.filter(row => skills.has(row.TemplateId!)),
    skills: tables.get("SkillTempInfos")!.rows.filter(row => skills.has(row.TemplateId!)),
    buffers: tables.get("CampaignBufferTemps")!.rows.filter(row => buffers.has(row.Id!)),
  };
  new TitleCatalog(input);
  return input;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = prepareTitleCatalog(), catalog = new TitleCatalog(input);
  const path = join(projectRoot, "reference/titles/content.json");
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".tmp";
  writeFileSync(temporary, JSON.stringify(input, null, 2) + "\n");
  renameSync(temporary, path);
  console.log(JSON.stringify({
    path: "reference/titles/content.json", titles: catalog.all.length,
    propertyDefinitions: input.properties.length, conditionTypes: new Set(catalog.all.map(t => t.requirement.conditionType)).size,
    unmappedConditions: [...new Set(catalog.all.filter(t => t.requirement.definitionStatus === "unmapped").map(t => t.requirement.conditionType))],
    pendingIntegration: catalog.all.length,
  }));
}
