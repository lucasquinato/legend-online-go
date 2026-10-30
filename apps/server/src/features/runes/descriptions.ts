import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";

import { bleedingRunePercent, bleedingRuneDamageCap, formatRunePercent } from "./balance.js";

const content = JSON.parse(readFileSync(join(projectRoot, "reference/runes/content.json"), "utf8"));
const descriptions = new Map<number, string>(), skillDescriptions = new Map<number, string>(), bufferDescriptions = new Map<number, string>();
for (const rune of content.runes as Message[]) if (Number(rune.RuneType) === 8) {
  const skill = (content.skills as Message[]).find(s => Number(s.TemplateId) === Number(rune.SkillTemplateId));
  const buffer = (content.buffers as Message[]).find(b => Number(b.Id) === Number(String(skill?.BufferIds).split(",")[0]));
  if (!skill || !buffer) continue;
  const percent = formatRunePercent(bleedingRunePercent(Number(buffer.Id))!);
  const cap = bleedingRuneDamageCap(Number(buffer.Id))!.toLocaleString("pt-BR");
  const text = `Causa sangramento em um inimigo aleatório: perde ${percent}% da vida máxima por ação, durante ${buffer.ValidCount} ações, limitado a ${cap} pontos de dano por ação.`;
  descriptions.set(Number(rune.TemplateId), text);
  skillDescriptions.set(Number(skill.TemplateId), `${text} Pode ser utilizada até ${rune.UseCount} vezes por batalha.`);
  bufferDescriptions.set(Number(buffer.Id), `Perde ${percent}% da vida máxima por ação, limitado a ${cap} pontos de dano por ação.`);
}
export const runeDescription = (id: number): string | undefined => descriptions.get(id);
export const runeSkillDescription = (id: number): string | undefined => skillDescriptions.get(id);
export const runeBufferDescription = (id: number): string | undefined => bufferDescriptions.get(id);
