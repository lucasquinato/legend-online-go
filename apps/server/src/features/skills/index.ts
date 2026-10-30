import { concentrationAttackPercent } from "./passive-balance.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";
import type { CityState } from "../../city-state.js";
import type { AttributeState } from "../../attributes.js";

const data = JSON.parse(readFileSync(join(projectRoot, "reference/skills/basic.json"), "utf8")) as { skills: Message[]; properties: Message[]; buffers: Message[] };
export const basicSkills = new Map<number, Message>(data.skills.map(row => [Number(row.TemplateId), row]));
export const basicSkillProperties = new Map(data.properties.map(row => [Number(row.TemplateId), row]));
for (const [id, property] of basicSkillProperties) {
  const percent = concentrationAttackPercent(id);
  if (percent !== undefined) { property.Attack = String(percent); basicSkills.get(id)!.Description = `Aumenta o ataque físico em ${percent}%.`; }
}
export const basicSkillBuffers = new Map(data.buffers.map(row => [Number(row.Id), row]));
export class SkillError extends Error {}
export interface SkillPage { learned: number[]; keys: string; }
export interface SkillSave { version: 1; job: number; active: number; unlocked: boolean; pages: SkillPage[]; }
export function skillBudget(level: number): number { return Math.floor(Math.max(0, Math.min(80, level)) / 2); }
export function initialSkills(job: number): number[] { return [job * 10000 + 711, job * 10000 + 811]; }
function fresh(): SkillPage { return { learned: [], keys: keysOf([]) }; }
function keysOf(keys: number[]): string { return [...keys.slice(0, 5), ...Array(Math.max(0, 5 - keys.length)).fill(-1)].join(",") + ","; }
export function spent(page: SkillPage): number { return page.learned.reduce((sum, id) => sum + Number(basicSkills.get(id)?.Grades ?? 0), 0); }
export function createSkills(hero: Message, job: number, level: number): SkillSave {
  const learned = new Map<number, number>();
  for (const value of [...initialSkills(job), ...String(hero.skill_script ?? "").split(",").map(Number)]) {
    const row = basicSkills.get(value);
    if (!row || Number(row.MasterType) !== job || Number(row.NeedPlayerGrade) > level) continue;
    const son = Number(row.SonType), old = learned.get(son);
    if (!old || Number(basicSkills.get(old)!.Grades) < Number(row.Grades)) learned.set(son, value);
  }
  const page: SkillPage = { learned: [...learned.values()], keys: "" };
  let removed = true;
  while (removed) {
    const before = page.learned.length;
    page.learned = page.learned.filter(id => initialSkills(job).includes(id) || String(basicSkills.get(id)!.PreTemplateId).split(",").map(Number).filter(Boolean).every(pre => {
      const required = basicSkills.get(pre);
      return required && page.learned.some(own => basicSkills.get(own)!.SonType === required.SonType && Number(basicSkills.get(own)!.Grades) >= Number(required.Grades));
    }));
    removed = before !== page.learned.length;
  }
  // Legacy captures may contain learning that never paid its points. Keep the
  // tutorial and only retain additional levels within the actual budget.
  if (spent(page) > skillBudget(level)) page.learned = initialSkills(job);
  const keys = String(hero.fast_key ?? "").split(",").map(Number).filter(key => key > 0 && page.learned.some(id => Number(basicSkills.get(id)!.SonType) === key && basicSkills.get(id)!.UseWay === "1"));
  page.keys = keysOf([...new Set(keys.length ? keys : initialSkills(job).map(id => Number(basicSkills.get(id)!.SonType)))]);
  return { version: 1, job, active: 0, unlocked: false, pages: [page, fresh()] };
}
export function syncSkills(save: SkillSave, state: CityState): void {
  const page = save.pages[save.active]!;
  Object.assign(state.hero, { skill_script: page.learned.length ? page.learned.join(",") + "," : "", skill_point: Math.max(0, skillBudget(state.player.grades) - spent(page)), fast_key: page.keys, skill_index: save.active, is_activeSecond: save.unlocked });
}
export function learnSkill(save: SkillSave, state: CityState, id: number): Message {
  const row = basicSkills.get(id), page = save.pages[save.active]!;
  if (!row || Number(row.MasterType) !== save.job) throw new SkillError("Habilidade fora da profissão inicial deste personagem");
  if (state.player.grades < Number(row.NeedPlayerGrade)) throw new SkillError(`Requer nível ${row.NeedPlayerGrade}`);
  const current = page.learned.find(value => basicSkills.get(value)!.SonType === row.SonType);
  if ((current ? Number(basicSkills.get(current)!.NextTemplateId) : Number(row.Grades) === 1 ? id : 0) !== id) throw new SkillError("Aprenda o próximo nível da habilidade, sem repetir ou pular níveis");
  if (skillBudget(state.player.grades) - spent(page) < 1) throw new SkillError("Pontos de habilidade insuficientes");
  for (const pre of String(row.PreTemplateId).split(",").map(Number).filter(Boolean)) {
    const required = basicSkills.get(pre);
    if (!required || !page.learned.some(value => { const own = basicSkills.get(value)!; return own.SonType === required.SonType && Number(own.Grades) >= Number(required.Grades); })) throw new SkillError("Pré-requisitos da habilidade não atendidos");
  }
  page.learned = [...page.learned.filter(value => value !== current), id];
  if (!current && row.UseWay === "1") {
    const keys = page.keys.split(",").filter(Boolean).map(Number), slot = keys.indexOf(-1);
    if (slot >= 0) keys[slot] = Number(row.SonType);
    page.keys = keysOf(keys);
  }
  syncSkills(save, state); return row;
}
export function setSkillKeys(save: SkillSave, value: string): void {
  const page = save.pages[save.active]!, keys = value.split(",").filter(Boolean).map(Number);
  const assigned = keys.filter(k => k !== -1);
  if (keys.length > 5 || new Set(assigned).size !== assigned.length || keys.some(k => !Number.isInteger(k) || (k !== -1 && !page.learned.some(id => Number(basicSkills.get(id)!.SonType) === k && basicSkills.get(id)!.UseWay === "1")))) throw new SkillError("Atalhos inválidos: use até cinco habilidades ativas aprendidas, sem repetição");
  page.keys = keysOf(keys);
}
export function resetSkillPage(save: SkillSave): void { save.pages[save.active] = fresh(); }
export function switchSkillPage(save: SkillSave, index: number): void {
  if (![0, 1].includes(index) || (index === 1 && !save.unlocked)) throw new SkillError("Distribuição de habilidades indisponível");
  save.active = index;
}
export function syncSkillAttributes(save: SkillSave, attributes: AttributeState): void {
  const names: Record<string, string> = { Attack: "phy_attack", Defence: "phy_defence", MagicAttack: "magic_attack", MagicDefence: "magic_defence", Live: "live", ForceHit: "force_hit", Power: "power", Agility: "agility", Intellect: "intellect", Physique: "physique", Captain: "captain" };
  const values: Record<string, number> = {}, percentages: Record<string, number> = {};
  for (const id of save.pages[save.active]!.learned) {
    const property = basicSkillProperties.get(id); if (!property) continue;
    for (const [field, attribute] of Object.entries(names)) for (const prefix of ["base", "total"]) {
      const target = Number(property.AddType) === 0 ? percentages : values, key = `${prefix}_${attribute}`;
      target[key] = (target[key] ?? 0) + Number(property[field] ?? 0);
    }
  }
  attributes.sources["skills:basic"] = { kind: "permanent", evidence: "recovered-table", values, percentages, derivePrimary: true };
}
