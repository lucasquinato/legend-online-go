import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";

// Always derive from the preserved originals, never rescale an already balanced save.
const content = JSON.parse(readFileSync(join(projectRoot,"reference/runes/content.json"),"utf8")) as { runes:Message[];skills:Message[];buffers:Message[] };
const percentages = new Map<number,number>();
export const BLEEDING_RUNE_DAMAGE_CAPS = Object.freeze({ normal:8000, advanced:20000 });
const damageCaps = new Map<number,number>();
for(const rune of content.runes) if(Number(rune.RuneType)===8) {
  const skill=content.skills.find(s=>Number(s.TemplateId)===Number(rune.SkillTemplateId));
  for(const id of String(skill?.BufferIds??"").split(",").map(Number)) {
    const buffer=content.buffers.find(b=>Number(b.Id)===id);
    if(buffer) {
      percentages.set(id,Math.round(Number(buffer.ValuePercent)*72)/100);
      damageCaps.set(id,Number(rune.Level)===0?BLEEDING_RUNE_DAMAGE_CAPS.normal:BLEEDING_RUNE_DAMAGE_CAPS.advanced);
    }
  }
}
/** Signed percentage: -10% becomes -7.2%; unrelated effects return undefined. */
export const bleedingRunePercent = (bufferId:number):number|undefined => percentages.get(bufferId);
export const bleedingRuneDamageCap = (bufferId:number):number|undefined => damageCaps.get(bufferId);
/** Cap each action's complete tick, including any stacks restored from a save. */
export function bleedingRuneDamage(bufferId:number,maxHp:number,percent:number,stacks=1):number {
  const damage=Math.round(maxHp*Math.abs(bleedingRunePercent(bufferId)??percent)/100*stacks);
  return Math.min(damage,bleedingRuneDamageCap(bufferId)??Infinity);
}
export const formatRunePercent = (percent:number):string => Math.abs(percent).toLocaleString("pt-BR",{maximumFractionDigits:2});
