import { gameDay } from "../../game-clock.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";
import type { CityState } from "../../city-state.js";
import { Inventory, InventoryError, itemTemplate } from "../../inventory.js";
import { runeDescription, runeSkillDescription, runeBufferDescription } from "./descriptions.js";

import { bleedingRunePercent } from "./balance.js";

const content = JSON.parse(readFileSync(join(projectRoot, "reference/runes/content.json"), "utf8")) as { runes: Message[]; skills: Message[]; buffers: Message[]; config: Message[] };
for (const row of content.runes) row.Description = runeDescription(Number(row.TemplateId)) ?? row.Description;
for (const row of content.skills) row.Description = runeSkillDescription(Number(row.TemplateId)) ?? row.Description;
for (const row of content.buffers) {
  row.BufferName = runeBufferDescription(Number(row.Id)) ?? row.BufferName;
  row.ValuePercent = bleedingRunePercent(Number(row.Id)) ?? row.ValuePercent;
}
export const runeRows = new Map<number, Message>(content.runes.map(r => [Number(r.TemplateId), r]));
const config = (name: string) => Number(content.config.find(r => r.ConfigName === name)!.ConfigValue);
export class RuneError extends Error {}
export interface RuneProgress { id: number; xp: number; swallowed: number; }
export interface RuneSave { version: 1; day: string; learned: Record<string, RuneProgress>; keys: number[]; }
export interface BattleRune {
  runeId: number; runeType: number; skillId: number; slot: number; maxUses: number;
  commonCooldownMs: number; cooldownMs: number; openingCooldownMs: number;
  skill: Message; buffers: Message[];
}
export const runeDay = gameDay;
export function createRunes(now: number): RuneSave { return { version: 1, day: runeDay(now), learned: {}, keys: [-1, -1] }; }
export function runeMaterial(item: Message): boolean { return Number(itemTemplate(item.template_id)?.SonType) === 302; }
function rowsFor(type: number, level: number): Message[] { return content.runes.filter(r => Number(r.RuneType) === type && Number(r.Level) === level).sort((a, b) => Number(a.RuneGrade) - Number(b.RuneGrade)); }
function next(row: Message): Message | undefined { const r = runeRows.get(Number(row.NextRuneId)); return r && Number(r.Level) === Number(row.Level) ? r : undefined; }
function jobAllowed(row: Message, state: CityState): boolean { return !Number(row.Job) || String(row.Job).split(",").includes(String(state.army.job)); }
// Local rule: level 80 unlocks advanced rune progression without advancing profession.
function runeLevel(row: Message, state: CityState): number { return Number(row.Level) === 0 ? Number(state.player.grades) : Number(state.player.grades) >= 80 ? Number.MAX_SAFE_INTEGER : 0; }
export function syncRunes(save: RuneSave, state: CityState, now: number): void {
  if (save.day !== runeDay(now)) { save.day = runeDay(now); for (const row of Object.values(save.learned)) row.swallowed = 0; }
  state.hero.rune = runeModel(save, Number(state.hero.player_id));
}
export function runeModel(save: RuneSave, uid: number): Message {
  return { user_id: uid, runeKey: save.keys.map(type => type > 0 ? save.learned[type]?.id ?? -1 : -1).join(","),
    runeinfo: Object.values(save.learned).map(r => ({ rune_id: r.id, rune_gp: r.xp, swallowCount: r.swallowed })) };
}
function available(save: RuneSave, id: number): RuneProgress {
  const row = runeRows.get(id), progress = row && save.learned[row.RuneType];
  if (!row || !progress || progress.id !== id) throw new RuneError("Runa não aprendida ou nível desatualizado");
  return progress;
}
function advance(progress: RuneProgress, level: number): void {
  for (;;) { const row = runeRows.get(progress.id)!, target = next(row);
    if (!target || Number(target.NeedGrade) > level || progress.xp < Number(target.NeedGp)) return;
    progress.xp -= Number(target.NeedGp); progress.id = Number(target.TemplateId);
  }
}
function capacity(progress: RuneProgress, level: number): number {
  let row = runeRows.get(progress.id)!, room = -progress.xp;
  for (;;) { const target = next(row); if (!target) return Math.max(0, room);
    room += Number(target.NeedGp); if (Number(target.NeedGrade) > level) return Math.max(0, room); row = target;
  }
}
export function materialXp(item: Message, row: Message): number {
  const t = itemTemplate(item.template_id)!; const type = Number(t.Property1 ?? 0);
  const value = type === 100 ? (Number(row.Level) === 0 ? 50 : 10) : Number(t.Property2 ?? 0);
  return type === 0 || type === 100 || type === Number(row.RuneType) ? value : Math.floor(value / 10);
}
export function operateRune(save: RuneSave, state: CityState, inventory: Inventory, request: Message, now: number): void {
  syncRunes(save, state, now);
  const level = Number(state.player.grades), op = Number(request.opType);
  if (level < config("OpenRuneGrade")) throw new RuneError(`Runas liberam no nível ${config("OpenRuneGrade")}`);
  if (op === 3) {
    const raw = String(request.runeKey ?? "").split(","); if (raw.at(-1) === "") raw.pop();
    if (raw.length > 2 || raw.some(x => !/^-?\d+$/.test(x))) throw new RuneError("Atalhos de runas inválidos");
    const ids = raw.map(Number); while (ids.length < 2) ids.push(-1);
    const types = ids.map(id => id === -1 ? -1 : Number(runeRows.get(available(save, id).id)!.RuneType));
    if (types[1]! > 0 && level < config("CarryTwoRune")) throw new RuneError(`Segunda runa exige nível ${config("CarryTwoRune")}`);
    if (types[0]! > 0 && types[0] === types[1]) throw new RuneError("Não equipe a mesma runa duas vezes");
    save.keys = types; return;
  }
  const row = runeRows.get(Number(request.runeId)); if (!row || !jobAllowed(row, state)) throw new RuneError("Runa inválida para esta profissão");
  if (op === 1) {
    const first = rowsFor(Number(row.RuneType), 0)[0];
    if (!first || Number(first.TemplateId) !== Number(row.TemplateId) || save.learned[row.RuneType]) throw new RuneError("Runa já aprendida ou aprendizado inválido");
    if (level < Number(row.NeedGrade)) throw new RuneError(`Requer nível ${row.NeedGrade}`);
    const count = Number(request.learn_runeCount ?? 1), pos = Number(request.learn_runePos);
    if (!Number.isSafeInteger(pos) || pos < 0 || !Number.isSafeInteger(count) || count < 1) throw new RuneError("Item de aprendizado inválido");
    const key = `1:0:${pos}`, item = state.items[key], t = item && itemTemplate(item.template_id);
    if (!item || !runeMaterial(item) || Number(t?.Property1) !== Number(row.RuneType) || count > item.count) throw new RuneError("O item selecionado não ensina esta runa ou quantidade insuficiente");
    const progress: RuneProgress = { id: Number(first.TemplateId), xp: 0, swallowed: 0 };
    // Learning consumes one rune; extra units feed its experience under the same rules.
    inventory.consume(key, 1); save.learned[row.RuneType] = progress;
    if (count > 1) absorb(save, state, inventory, progress, [{ key, count: count - 1 }]);
    return;
  }
  const progress = available(save, Number(row.TemplateId));
  if (op === 2) {
    advance(progress, runeLevel(row, state));
    const materials = Object.entries(state.items).filter(([, i]) => i.bag_type === 0 && i.object_id === 0 && i.pos >= 0 && i.pos < 8).sort((a, b) => Number(a[1].pos) - Number(b[1].pos));
    if (!materials.length) { if (progress.id !== Number(row.TemplateId)) return; throw new RuneError("Coloque materiais nos slots de absorção"); }
    if (progress.id !== Number(row.TemplateId) && capacity(progress, runeLevel(row, state)) === 0) return;
    absorb(save, state, inventory, progress, materials.map(([key, i]) => ({ key, count: Number(i.count) }))); return;
  }
  if (op === 4) {
    if (level < 80) throw new RuneError("A promoção de runas exige nível 80");
    if (next(row)) throw new RuneError("Conclua os níveis da runa antes de promover");
    const target = rowsFor(Number(row.RuneType), Number(row.Level) + 1)[0];
    if (!target) throw new RuneError("Esta runa não possui promoção disponível na tabela");
    if (runeLevel(target, state) < Number(target.NeedGrade)) throw new RuneError(`Requer nível de profissão ${target.NeedGrade}`);
    inventory.consumeTemplate(3021001, 10); progress.id = Number(target.TemplateId); progress.xp = 0; return;
  }
  throw new RuneError("Operação de runa desconhecida");
}
function absorb(save: RuneSave, state: CityState, inventory: Inventory, progress: RuneProgress, materials: { key: string; count: number }[]): void {
  let consumed = 0;
  for (const material of materials) {
    const item = state.items[material.key];
    if (!item || !runeMaterial(item)) throw new RuneError("Material de absorção inválido");
    const xp = materialXp(item, runeRows.get(progress.id)!); if (xp <= 0) throw new RuneError("Este material não concede experiência à runa");
    const progressionLevel = runeLevel(runeRows.get(progress.id)!, state);
    const room = capacity(progress, progressionLevel), remaining = config("RuneSwallowMax") - progress.swallowed;
    const count = Math.min(material.count, remaining, Math.ceil(room / xp));
    if (count <= 0) break;
    inventory.consume(material.key, count); progress.xp += Math.min(room, xp * count); progress.swallowed += count; consumed += count; advance(progress, progressionLevel);
  }
  if (!consumed) throw new RuneError("Runa no limite de nível, experiência ou consumo diário");
}
/** Snapshot only. The battle engine owns use counters, cooldowns and effect execution. */
export function runeBattleContract(state: CityState): BattleRune[] {
  const model = state.hero.rune ?? {}, ids = String(model.runeKey ?? "-1,-1").split(",").map(Number);
  return ids.flatMap((id, slot) => {
    const row = runeRows.get(id), skill = row && content.skills.find(s => Number(s.TemplateId) === Number(row.SkillTemplateId));
    if (!row || !skill || state.player.grades < (slot ? config("CarryTwoRune") : config("OpenRuneGrade")) || !jobAllowed(row, state) || !(model.runeinfo ?? []).some((p: Message) => Number(p.rune_id) === id)) return [];
    return [{ runeId: id, runeType: Number(row.RuneType), skillId: Number(row.SkillTemplateId), slot, maxUses: Number(row.UseCount), commonCooldownMs: config("RuneCommonCD"), cooldownMs: Number(skill.CoolDown), openingCooldownMs: Number(skill.AppearCD), skill: structuredClone(skill), buffers: content.buffers.filter(b => String(skill.BufferIds).split(",").includes(String(b.Id))).map(b => structuredClone(b)) }];
  });
}
export function moveRuneMaterial(state: CityState, inventory: Inventory, r: Message): boolean {
  const source = `${r.begin_bag_type}:${r.begin_obj_id ?? 0}:${r.begin_pos}`, item = state.items[source];
  if (!item || !runeMaterial(item) || (r.begin_bag_type !== 0 && r.end_bag_type !== 0)) return false;
  if (state.player.grades < config("OpenRuneGrade")) throw new RuneError("Runas liberam no nível 35");
  if (![0, 1].includes(r.begin_bag_type) || ![0, 1].includes(r.end_bag_type) || Number(r.begin_obj_id ?? 0) !== 0 || Number(r.end_obj_id ?? 0) !== 0 || (r.end_bag_type === 0 && (!Number.isInteger(r.end_pos) || r.end_pos < 0 || r.end_pos > 7))) throw new InventoryError("Slot temporário de runa inválido");
  const requested = Number(r.count ?? 0);
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > Number(item.count)) throw new InventoryError("Quantidade de material rúnico inválida");
  // Both drag/drop and double click send count=1. Rune staging moves the whole
  // pile, including when closing the window returns unused materials to the bag.
  inventory.move({ ...r, begin_obj_id: 0, end_obj_id: 0, count: item.count }); return true;
}
