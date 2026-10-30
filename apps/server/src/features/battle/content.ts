import { BLOCK_HEAL_PERCENT, blockHealingDescription, isBlockHealingBuffer } from "../skills/healing-balance.js";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { skillDescription } from "../skills/descriptions.js";
import { basicSkills } from "../skills/index.js";

import { bleedingRunePercent } from "../runes/balance.js";

export type Row = Record<string, string>;
const packed = inflateSync(readFileSync(join(projectRoot, "reference/quests/tempinfos.original.bin")).subarray(4));
const wanted = new Set(["SkillTempInfos", "SkillBufferTempInfos", "ActionTempInfos", "ActionInfos", "HeroAis", "GameHeroTemp", "PawnTempInfos"]);
const tables: Record<string, Row[]> = {};
let pos = 4;
while (pos < packed.length) {
  const n = packed[pos++]!, name = packed.subarray(pos, pos + n).toString(); pos += n;
  const size = packed.readUInt32BE(pos); pos += 4;
  if (wanted.has(name)) tables[name] = [...packed.subarray(pos, pos + size).toString().matchAll(/<\w+\s+([^>]*?)\/>/g)]
    .map(m => Object.fromEntries([...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map(a => [a[1]!, a[2]!])));
  pos += size;
}
const map = (name: string, key: string) => new Map((tables[name] ?? []).map(r => [Number(r[key]), r]));
export const skills = map("SkillTempInfos", "TemplateId");
for (const [id, row] of basicSkills) skills.set(id, row as Row);
export const buffers = map("SkillBufferTempInfos", "Id");
for (const [id, row] of buffers) {
  if (isBlockHealingBuffer(id)) { row.ValuePercent = String(BLOCK_HEAL_PERCENT); row.BufferName = blockHealingDescription(id === 10521 ? 2 : 1); }
  const percent = bleedingRunePercent(id);
  if (percent !== undefined) row.ValuePercent = String(percent);
}
export const actions = map("ActionTempInfos", "ActionId");
export const heroRows = map("GameHeroTemp", "TemplateId");
export const pawnRows = map("PawnTempInfos", "TemplateId");
export const ais = map("HeroAis", "ID");
export const ids = (value: unknown): number[] => String(value ?? "").split(",").map(Number).filter(n => n > 0);
export const description = (skill: number): string => basicSkills.has(skill) ? skillDescription(skill) : String(skills.get(skill)?.Description ?? "");
const frames = new Map<number, number>();
for (const row of tables.ActionInfos ?? []) {
  const id = Number(row.ActionId), frame = Number(row.Frame ?? row.FrameIndex ?? row.FrameNum ?? 0);
  frames.set(id, Math.max(frames.get(id) ?? 0, frame));
}
export function actionFrames(skill: number): number {
  const id = Number(skills.get(skill)?.ActionId);
  return Math.max(0, Number(actions.get(id)?.FrameNum ?? 0), frames.get(id) ?? 0) || 25;
}
