import { BLOCK_HEAL_PERCENT, blockHealingChance, criticalHealingAllowed } from "../skills/healing-balance.js";
import { bleedingRunePercent, bleedingRuneDamage } from "../runes/balance.js";
import type { Message } from "../../messages.js";
import type { BattleRune } from "../runes/index.js";
import { actions, actionFrames, ais, buffers, description, heroRows, ids, pawnRows, skills, type Row } from "./content.js";
import { applyHealth, blockChance, criticalChance, offensiveDamage, resolveDamage } from "./mechanics.js";
import { criticalMultiplier, modifierActivates, modifierAmount, modifierSum, permanentDamage, type PermanentModifiers } from "./permanent-modifiers.js";
import { effectCanBeRemoved, ensureEffectRemoval } from "./effect-removal.js";

import { evaluateBattleActions, type AiDecision } from "./tactical-ai.js";
import { advanceInitiative, reserveInitiative, traceInitiative, type InitiativeCharge, type InitiativeClock } from "./initiative.js";
import { battlePressureDamage, type BattlePressure } from "./pressure.js";

export interface Stats { attack: number; magicAttack: number; defence: number; magicDefence: number; critical: number; block: number; penetration: number; level: number; }
export interface Actor {
  id: number; template: number; side: number; pos: number; hp: number; maxHp: number;
  stats: Stats; learned: number[]; defaultSkill: number; fury: number; cooldowns: Record<string, number>;
  uses: Record<string, number>; actionCount: number; aiStep: number;
  permanentModifiers?: PermanentModifiers;
  autoBattle?: boolean; equippedSkills?: number[]; lastAiDecision?: AiDecision;
  runes?: BattleRune[];
  marriage?:{partner:number;active:number[];passive:number[]};
  runeStartedAt?: number; rejects?: number[];
  initiative?: InitiativeCharge;
}
export interface Effect {
  id: number; template: number; source: number; target: number; type: number;
  remaining: number; maximum: number; stacks: number; cap: number; percent: number; value: number;
  appliedAction: number; shield?: number; kind: "outgoing" | "incoming" | "dot" | "reflect" | "shield" | "healAction" | "discount" | "critResistance" | "disabled" | "limit" | "confusion" | "silence" | "slow" | "defenceDown";
  skillIds?: number[];
  raw?: number; harmful: boolean; removable: boolean; charges?: number;
  healthPercent?: boolean;
  fate?: boolean;
}
export interface Choice { actor: number; skill: number; targets: number[]; sequence: number; automatic: boolean; confusion?: number; selectedAt?:number; readyAt?:number; initiativeCost?:number; initiativeCycle?:number; }
export interface Engine {
  version: 1; actors: Actor[]; effects: Effect[]; queue: Choice[]; sequence: number;
  effectSequence: number; rng: number; hero: number; serial: number;
  players?: number[]; battleId?: string;
  initiative?: InitiativeClock;
  pressure?: BattlePressure;
}
export interface Resolution { actor: number; skill: number; damages: Message[]; buffers: Message[]; furyAdded: number; frames: number; canceled: boolean; revives?:Message[]; }
export interface Policy {
  minimumHp?: (target: Actor, attacker: Actor) => number;
  scriptedDamage?: (target: Actor, hit: number) => number;
  scriptedTargets?: number[];
  scriptedFury?: number;
  suppressTriggers?: boolean;
  hits?: number;
}
export function random(engine: Engine): number {
  let x = engine.rng || 1; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; engine.rng = x >>> 0;
  return engine.rng / 4294967296;
}
export function createEngine(actors: Actor[], hero: number, seed = 1, players = [hero]): Engine {
  return { version: 1, actors, hero, players, effects: [], queue: [], sequence: 0, effectSequence: 0, rng: seed >>> 0 || 1, serial: 0 };
}
export function makeActor(model: Message, stats: Partial<Stats>, defaultSkill?: number): Actor {
  const template = Number(model.temp_id), row = heroRows.get(template) ?? pawnRows.get(template);
  return {
    id: Number(model.living_id), template, side: Number(model.side), pos: Number(model.pos),
    hp: Number(model.hp ?? model.init_hp), maxHp: Number(model.max_hp ?? model.init_hp ?? model.hp),
    stats: { attack: 0, magicAttack: 0, defence: 0, magicDefence: 0, critical: 0, block: 0, penetration: 0, level: Math.max(1, Number(model.grade ?? 1)), ...stats },
    learned: [...new Set<number>((model.skillId ?? []).map(Number))],
    defaultSkill: defaultSkill ?? Number(row?.DefaultSkill ?? model.skillId?.[0] ?? 10000),
    rejects: ids(model.reject_types ?? row?.RejectType),
    fury: Number(model.sp ?? 0), cooldowns: {}, uses: {}, actionCount: 0, aiStep: 0,
  };
}
const family = (skill: number) => Number(skills.get(skill)?.SonType ?? 0);
const isRune = (skill: number) => family(skill) >= 9001 && family(skill) <= 9010;
// CountWay 1/2 belong to heroes; 3/4 are physical/magical troop attacks.
const magicalSkill = (skill: number) => [2, 4].includes(Number(skills.get(skill)?.CountWay));
const own = (e: Engine, a: Actor) => e.effects.filter(b => b.target === a.id && b.remaining !== 0);
const amount = (e: Engine, a: Actor, kind: Effect["kind"]) => own(e, a).filter(b => b.kind === kind).reduce((n, b) => n + b.percent * b.stacks, 0);
const pick = (e: Engine, list: Actor[]) => list[Math.floor(random(e) * list.length)];
const confusionId = (e: Engine, actor: Actor): number => own(e, actor).find(b => b.kind === "confusion")?.id ?? 0;
export function initializeRuneCooldowns(e: Engine, now: number): void {
  for (const actor of e.actors) if (actor.runes?.length && actor.runeStartedAt === undefined) {
    actor.runeStartedAt = now;
    for (const rune of actor.runes) actor.cooldowns[rune.skillId] = Math.max(actor.cooldowns[rune.skillId] ?? 0, now + rune.openingCooldownMs);
  }
}
function rowSide(skill: number): boolean {
  const row = skills.get(skill), text = description(skill);
  if (isRune(skill)) return [9001, 9002, 9003, 9005, 9009].includes(family(skill));
  return Number(row?.CountWay) === 7 || /purificação|escudo|reflexão|luz da aurora|recuperação|espírito de combate|convicção|barreira/i.test(row?.TemplateName ?? "") ||
    (Number(row?.Parameter1) === 0 && /aliad|própri|membros|todos/i.test(text) && !/inimig|oposta|advers/i.test(text));
}
/** Logical targets, not animation impacts; duplicate IDs are intentional for double shot. */
export function selectTargets(e: Engine, actor: Actor, skill: number): number[] {
  if(skill>=9991&&skill<=9999){const partner=e.actors.find(a=>a.id===actor.marriage?.partner&&a.hp>0&&a.side===actor.side);return partner&&actor.marriage?.active.includes(skill)?[actor.id,partner.id]:[];}
  const row = skills.get(skill), accept = Number(row?.AcceptObject ?? 1), allies = rowSide(skill);
  let eligible = e.actors.filter(a => a.hp > 0 && (allies ? a.side === actor.side : a.side !== actor.side));
  const confused = !!confusionId(e, actor);
  if (confused) {
    if (allies) eligible = e.actors.filter(a => a.hp > 0 && a.side !== actor.side);
    else {
      const friends = e.actors.filter(a => a.hp > 0 && a.side === actor.side && a.id !== actor.id);
      if (friends.length) eligible = friends;
    }
  }
  if (!eligible.length) return [];
  if (accept === 4) return [confused && allies ? pick(e, eligible)!.id : actor.id];
  if (accept === 3) return eligible.map(a => a.id);
  if (accept === 5) {
    const low = Math.min(...eligible.map(a => a.hp / a.maxHp));
    eligible = eligible.filter(a => a.hp / a.maxHp === low);
    return [pick(e, eligible)!.id];
  }
  const column = (a: Actor) => (a.pos - 1) % 3;
  if ([6, 7, 8, 9].includes(accept)) {
    const c = (accept === 7 || accept === 9) ? Math.max(...eligible.map(column)) : Math.min(...eligible.map(column));
    eligible = eligible.filter(a => column(a) === c);
    return (accept === 8 || accept === 9) ? eligible.map(a => a.id) : [pick(e, eligible)!.id];
  }
  if (accept === 14) {
    const columns = [...new Set(eligible.map(column))], c = columns[Math.floor(random(e) * columns.length)];
    return eligible.filter(a => column(a) === c).map(a => a.id);
  }
  if (accept === 16) {
    const max = Math.min(6, eligible.length), n = max <= 2 ? max : 2 + Math.floor(random(e) * (max - 1));
    const out: number[] = [];
    while (out.length < n) { const index = Math.floor(random(e) * eligible.length); out.push(eligible.splice(index, 1)[0]!.id); }
    return out;
  }
  if (accept === 17) {
    const heroes = eligible.filter(a => a.template <= 6); if (heroes.length) eligible = heroes;
  }
  if (family(skill) === 208 || accept === 2) return [pick(e, eligible)!.id, pick(e, eligible)!.id];
  return [pick(e, eligible)!.id];
}
export function effectiveCost(e: Engine, actor: Actor, skill: number): number {
  const cost = Number(skills.get(skill)?.Cost ?? 0);
  return cost < 0 ? Math.min(0, cost - own(e, actor).filter(b => b.kind === "discount").reduce((n, b) => n + b.value, 0)) : cost;
}
export function canUse(e: Engine, actor: Actor, skill: number, now: number): boolean {
  const row = skills.get(skill);
  if(skill>=9991&&skill<=9999){const limit=Number(String(row?.Description??'').match(/(\d+)\s*vez/)?.[1]??1);if(!actor.marriage?.active.includes(skill)||!e.actors.some(a=>a.id===actor.marriage?.partner&&a.side===actor.side&&a.hp>0)||(actor.uses[skill]??0)>=limit)return false;}
  const rune = actor.runes?.find(r => r.skillId === skill);
  if (isRune(skill) && (!rune || (actor.uses[skill] ?? 0) >= rune.maxUses || now < (actor.runeStartedAt ?? 0) + rune.openingCooldownMs)) return false;
  return actor.hp > 0 && !!row && Number(row.UseWay) !== 2 && actor.fury + effectiveCost(e, actor, skill) >= 0 &&
    (actor.cooldowns[skill] ?? 0) <= now && (family(skill) !== 106 || (actor.uses[skill] ?? 0) < 10) &&
    !own(e, actor).some(b => b.kind === "disabled" || (["limit", "silence"].includes(b.kind) && b.skillIds?.includes(skill)));
}
export function choose(e: Engine, actorId: number, skill: number, now: number, automatic = false): Choice | undefined {
  advanceInitiative(e,now);
  if(e.initiative?.pausedAt!==undefined)return;
  const actor = e.actors.find(a => a.id === actorId);
  if (!actor || (!automatic && !actor.learned.includes(skill)) || !canUse(e, actor, skill, now)) {
    if(!automatic)traceInitiative(e,"reject",{actor:actorId,skill,at:now,reason:"unavailable"});return;
  }
  const previous = e.queue.find(a => a.actor === actorId);
  if (previous && !previous.automatic) {
    if(!automatic)traceInitiative(e,"reject",{actor:actorId,skill,at:now,reason:"manual-reservation",reserved:previous.skill});return;
  }
  // A fallback already ready is committed to this cycle, even if its animation waits.
  if(!automatic&&e.initiative&&previous?.readyAt!==undefined&&previous.readyAt<=now){
    traceInitiative(e,"reject",{actor:actorId,skill,at:now,reason:"action-ready",reserved:previous.skill,readyAt:previous.readyAt});return;
  }
  if (!automatic) actor.autoBattle = false;
  e.queue = e.queue.filter(a => a.actor !== actorId);
  const choice = { actor: actorId, skill, targets: selectTargets(e, actor, skill), sequence: ++e.sequence, automatic, confusion: confusionId(e, actor) };
  reserveInitiative(e,choice,now);
  if(!automatic)traceInitiative(e,"reserve",{actor:actorId,skill,at:now,readyAt:(choice as Choice).readyAt,cost:(choice as Choice).initiativeCost,cycle:(choice as Choice).initiativeCycle});
  e.queue.push(choice); return choice;
}
export function aiSkill(e: Engine, actor: Actor, now: number): number {
  const row = heroRows.get(actor.template) ?? pawnRows.get(actor.template), ai = ais.get(Number(row?.AI));
  const configured = ids(ai?.Skills), candidates = configured.length ? configured : actor.learned.filter(id => Number(skills.get(id)?.UseWay) !== 2);
  const low = actor.hp / actor.maxHp <= 0.3 ? Number(ai?.LessHpSkill ?? 0) : 0;
  const fury = actor.fury >= 80 ? Number(ai?.AngrySkill ?? ai?.AwakenSkill ?? 0) : 0;
  for (const id of [low, fury]) if (id && canUse(e, actor, id, now)) return id;
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[(actor.aiStep + i) % candidates.length]!;
    if (canUse(e, actor, id, now)) { actor.aiStep = (actor.aiStep + i + 1) % candidates.length; return id; }
  }
  return actor.defaultSkill;
}
export function populateAutomatic(e: Engine, now: number): void {
  if(e.initiative?.pausedAt!==undefined)return;
  for (const actor of e.actors.filter(a => a.hp > 0)) {
    if (e.queue.some(c => c.actor === actor.id)) continue;
    const player = (e.players ?? [e.hero]).includes(actor.id);
    let id = player ? actor.defaultSkill : aiSkill(e, actor, now);
    if (player && actor.autoBattle && !own(e, actor).some(b => b.kind === "disabled")) {
      actor.lastAiDecision = evaluateBattleActions(e, actor, now); id = actor.lastAiDecision.skill;
      console.info("battle-ai", JSON.stringify({ battle: e.battleId, actor: actor.id, serial: e.serial, ...actor.lastAiDecision }));
    }
    if (own(e, actor).some(b => b.kind === "disabled")) {
      const choice={ actor: actor.id, skill: id, targets: selectTargets(e, actor, id), sequence: ++e.sequence, automatic: true };
      reserveInitiative(e,choice,now);e.queue.push(choice);
    }
    else choose(e, actor.id, id, now, true);
  }
  e.queue = e.queue.filter(c => e.actors.some(a => a.id === c.actor && a.hp > 0));
}
function wire(b: Effect, operation: number, damage: Message[] = []): Message {
  return { buffer_id: b.id, template_id: b.template, source_id: b.source, target_id: b.target,
    cur_turn: operation === 2 ? 0 : b.remaining, max_turn: b.maximum, pressed_num: b.stacks,
    see_type: operation, exe_way: b.kind === "dot" || b.kind === "healAction" ? 1 : 2,
    isPermanent: b.remaining < 0, damage,
    // Recovered curRound/maxRound fields: zero would make the client erase the buff.
    $15: { wire: 0, value: operation === 2 ? "0" : "-1" }, $16: { wire: 0, value: "-1" },
    ...(b.skillIds?.length ? { unSkillIds: b.skillIds, $17: { wire: 0, value: String(b.skillIds[0]) } } : {}) };
}
function emitChange(list: Message[], b: Effect, op: number, damage: Message[] = []): void { list.push(wire(b, op, damage)); }
export function applyEffect(e: Engine, source: Actor, target: Actor, row: Row, list: Message[], kind: Effect["kind"], raw?: number): Effect {
  // Same effect family refreshes/upgrades rather than coexisting with its old rank.
  const key = Math.floor(Number(row.Id) / 100), old = e.effects.find(b => b.target === target.id && Math.floor(b.template / 100) === key && b.kind === kind);
  const remaining = Number(row.ValidCount), cap = Math.max(1, Number(row.PressCount));
  const b: Effect = old ?? { id: ++e.effectSequence, template: Number(row.Id), source: source.id, target: target.id,
    type: Number(row.AttackType), kind, remaining, maximum: remaining, stacks: 0, cap,
    percent: Number(row.ValuePercent), value: Number(row.AttackValue), appliedAction: target.actionCount,
    removable: effectCanBeRemoved(row, kind, remaining),
    harmful: ["dot", "disabled", "confusion", "silence", "slow"].includes(kind) || (kind === "incoming" ? Number(row.ValuePercent) > 0 : Number(row.ValuePercent) < 0) };
  Object.assign(b, { template: Number(row.Id), source: source.id, remaining, maximum: remaining,
    removable: effectCanBeRemoved(row, kind, remaining),
    cap, stacks: Math.min(cap, b.stacks + 1), percent: Number(row.ValuePercent), value: Number(row.AttackValue), appliedAction: target.actionCount });
  if (raw !== undefined) b.raw = raw;
  if (kind === "shield") b.shield = Math.round(target.maxHp * Math.abs(b.percent) / 100);
  if (!old) e.effects.push(b);
  emitChange(list, b, 0); return b;
}
function hp(e: Engine, actor: Actor, requested: number, order = 0, policy: Policy = {}, attacker = actor, criticalHeal = false, damageScaled = false): Message {
  if(!policy.scriptedDamage&&!damageScaled)requested=battlePressureDamage(e,requested);
  // Only the immediate heals Regeneração/Luz da Graça Divina can crit.
  // They share the caster's additive critical-damage multiplier with attacks.
  const chance = criticalChance(attacker.stats.critical, actor.stats.level, 0, attacker.stats.level);
  const critical = criticalHeal && requested < 0 && actor.hp > 0 && !policy.scriptedDamage && !policy.suppressTriggers && chance > 0 && random(e) < chance;
  if (critical) requested = -Math.round(-requested * criticalMultiplier(attacker.permanentModifiers ?? [],attacker.stats));
  // Healing cannot resurrect a defeated actor, including after reflection.
  if (requested < 0 && actor.hp <= 0) requested = 0;
  const result = applyHealth(actor, requested, policy.minimumHp?.(actor, attacker) ?? 0);
  // hp_limit is a CHANGE to maximum HP in this protocol, not the actor's maximum.
  return { living_id: actor.id, damage_type: 6, damage_value: result.display, left_value: result.left, order, extra_data: critical ? 1 : 0, parry: false };
}
function fury(actor: Actor, delta: number): Message {
  actor.fury = Math.max(0, Math.min(100, actor.fury + delta));
  return { living_id: actor.id, damage_type: 9, damage_value: delta, left_value: actor.fury, order: 0 };
}
function removeEffect(e: Engine, b: Effect, list: Message[]): void { e.effects = e.effects.filter(v => v.id !== b.id); emitChange(list, b, 2); }
function expireAction(e: Engine, actor: Actor, initialEffects: number[], list: Message[]): void {
  for (const b of own(e, actor)) if (!b.fate && initialEffects.includes(b.id) && b.appliedAction !== actor.actionCount && b.remaining > 0) {
    b.remaining--; if (!b.remaining) removeEffect(e, b, list); else emitChange(list, b, 0);
  }
}
function passiveRows(actor: Actor): { skill: number; row: Row }[] {
  return actor.learned.filter(id => Number(skills.get(id)?.UseWay) === 2).flatMap(skill => ids(skills.get(skill)?.BufferIds).flatMap(id => {
    const row = buffers.get(id); return row ? [{ skill, row }] : [];
  }));
}
function healingBonus(actor: Actor, incoming: boolean): number {
  return passiveRows(actor).filter(({ skill, row }) => Number(row.AttackType) === 14 && (incoming ? family(skill) === 104 : family(skill) === 304))
    .reduce((n, { row }) => n + Number(row.ValuePercent), 0);
}
function procChance(skill: number): number {
  if (family(skill) === 105) return blockHealingChance(Number(skills.get(skill)?.Grades));
  const text = description(skill), match = text.match(/(\d+)%\s*(?:de\s*)?(?:chance|probabilidade)/i) ?? text.match(/(?:chance|probabilidade)[^\d]*(\d+)%/i);
  return match ? Number(match[1]) / 100 : 1;
}
function passives(e: Engine, actor: Actor, event: "action" | "critical" | "damage" | "block", list: Message[], policy: Policy): void {
  if (policy.suppressTriggers || actor.hp <= 0) return;
  for (const { skill, row } of passiveRows(actor)) {
    const f = family(skill), type = Number(row.AttackType);
    if ((event === "action" && f === 101) || (event === "critical" && f === 201) || (event === "damage" && f === 301)) {
      list.push({ template_id: Number(row.Id), source_id: actor.id, target_id: actor.id, cur_turn: -1, max_turn: -1, see_type: 1, exe_way: 1, pressed_num: 1, isPermanent: true, damage: [fury(actor, Number(row.AttackValue))] });
    }
    if (event === "critical" && f === 205) {
      for (const ally of e.actors.filter(a => a.side === actor.side && a.hp > 0)) applyEffect(e, actor, ally, row, list, "outgoing");
    }
    if (event === "block" && f === 105 && random(e) < procChance(skill)) {
      list.push({ template_id: Number(row.Id), source_id: actor.id, target_id: actor.id, cur_turn: 1, max_turn: 1, see_type: 1, exe_way: 4, damage: [hp(e, actor, -Math.round(actor.maxHp * BLOCK_HEAL_PERCENT / 100), 0, policy)] });
    }
    if (event === "action" && f === 305 && random(e) < procChance(skill)) applyEffect(e, actor, actor, row, list, "discount");
    // Other recovered event effects share the same explicit operation mapping.
    if (![101, 201, 301, 205, 105, 305, 104, 304, 115].includes(f) && type === 15 && event === "block" && random(e) < procChance(skill)) applyEffect(e, actor, actor, row, list, "incoming");
  }
}
export function initializePassives(e: Engine): void {
  for (const actor of e.actors) for (const { skill, row } of passiveRows(actor)) {
    if (family(skill) === 115) applyEffect(e, actor, actor, row, [], Number(row.AttackType) === 31 ? "critResistance" : "incoming");
  }
}
export function actorBuffers(e: Engine, id: number): Message[] { ensureEffectRemoval(e.effects); return e.effects.filter(b => b.target === id).map(b => wire(b, 0)); }
function applySkillEffects(e: Engine, actor: Actor, target: Actor, skill: number, raw: number, list: Message[], policy: Policy): void {
  if (isRune(skill) && target.hp <= 0) return;
  const f = family(skill);
  for (const id of ids(skills.get(skill)?.BufferIds)) {
    const row = buffers.get(id); if (!row) continue;
    const type = Number(row.AttackType);
    if (target.rejects?.includes(type)) continue;
    if (isRune(skill) && [13, 38, 39].includes(type)) {
      if (random(e) >= procChance(skill)) continue;
      if (type === 39) {
        const eligible = [...new Set(target.learned)].filter(id => Number(skills.get(id)?.UseWay) === 1 && id !== target.defaultSkill && (!isRune(id) || target.runes?.some(r => r.skillId === id)));
        const chosen: number[] = [];
        while (eligible.length && chosen.length < Number(row.AttackValue)) chosen.push(eligible.splice(Math.floor(random(e) * eligible.length), 1)[0]!);
        if (chosen.length) { const effect = applyEffect(e, actor, target, row, [], "silence"); effect.skillIds = chosen; emitChange(list, effect, 0); }
      } else applyEffect(e, actor, target, row, list, type === 38 ? "confusion" : "slow");
      continue;
    }
    if (isRune(skill) && type === 33) {
      if (Number(row.ValuePercent) < 0) {
        const effect = applyEffect(e, actor, target, row, list, "dot"); effect.healthPercent = true;
      } else list.push({ template_id: id, source_id: actor.id, target_id: target.id, cur_turn: 1, see_type: 1, exe_way: 4,
        damage: [hp(e, target, -Math.round(target.maxHp * Number(row.ValuePercent) / 100), 0, policy, actor)] });
      continue;
    }
    if ((f === 109 || f === 111 || f === 315) && random(e) >= procChance(skill)) continue;
    if (type === 18) {
      const harmful = rowSide(skill), count = Math.max(1, Number(row.AttackValue));
      const eligible = own(e, target).filter(b => b.harmful === harmful && b.removable && b.remaining > 0 && b.kind !== "limit");
      if (count >= eligible.length) for (const b of eligible) removeEffect(e, b, list);
      else for (let i = 0; i < count; i++) {
        const index = Math.floor(random(e) * eligible.length);
        removeEffect(e, eligible.splice(index, 1)[0]!, list);
      }
    } else if (type === 6) {
      list.push({ template_id: id, source_id: actor.id, target_id: target.id, cur_turn: 1, see_type: 1, exe_way: 4, damage: [fury(f === 111 ? actor : target, Number(row.AttackValue))] });
    } else if (type === 21) {
      // Free-combat life steal runs after all reflections, using final impacts.
      // Keep the rehearsed tutorial's existing scripted effect path.
      if (policy.scriptedDamage) list.push({ template_id: id, source_id: actor.id, target_id: actor.id, cur_turn: 1, see_type: 1, exe_way: 4, damage: [hp(e, actor, -Math.round(raw * Math.abs(Number(row.ValuePercent)) / 100), 0, policy)] });
    } else if (type === 305 && (f === 109 || f === 315)) {
      const magical = magicalSkill(skill);
      const extra = offensiveDamage(magical ? actor.stats.magicAttack : actor.stats.attack, magical ? target.stats.magicDefence : target.stats.defence, Math.abs(Number(row.ValuePercent)) / 100);
      list.push({ template_id: id, source_id: actor.id, target_id: target.id, cur_turn: 1, see_type: 1, exe_way: 4, damage: [hp(e, target, Math.round(extra), 0, policy, actor)] });
    } else if (type === 305) {
      const magical = magicalSkill(skill);
      applyEffect(e, actor, target, row, list, "dot", offensiveDamage(magical ? actor.stats.magicAttack : actor.stats.attack, magical ? target.stats.magicDefence : target.stats.defence, Math.abs(Number(row.ValuePercent)) / 100));
    } else if (type === 34) applyEffect(e, actor, target, row, list, "shield");
    else if (type === 24) applyEffect(e, actor, target, row, list, "reflect");
    else if (type === 33) applyEffect(e, actor, target, row, list, "healAction");
    else if (type === 15 || f === 214) applyEffect(e, actor, target, f === 214 ? { ...row, ValuePercent: String(Math.abs(Number(row.ValuePercent))) } : row, list, "incoming");
    else if (type === 20 || type === 40) applyEffect(e, actor, target, row, list, "outgoing");
    else if (type === 19) applyEffect(e, actor, target, row, list, "disabled");
  }
}
export function execute(e: Engine, choice: Choice, now: number, policy: Policy = {}): Resolution {
  advanceInitiative(e,now);
  ensureEffectRemoval(e.effects);
  // Existing battle saves may still carry the old percentage. Apply the same
  // canonical value once; preserve source, remaining actions and stack count.
  for (const effect of e.effects) if (effect.kind === "dot" && effect.healthPercent) {
    effect.percent = bleedingRunePercent(effect.template) ?? effect.percent;
  }
  const actor = e.actors.find(a => a.id === choice.actor)!;
  const result: Resolution = { actor: actor.id, skill: choice.skill, damages: [], buffers: [], furyAdded: 0, frames: actionFrames(choice.skill), canceled: false };
  if (actor.hp <= 0) { result.canceled = true; return result; }
  actor.actionCount++;
  const initialEffects = own(e, actor).map(b => b.id);
  for (const b of own(e, actor).filter(b => b.kind === "dot")) {
    emitChange(result.buffers, b, 1, [hp(e, actor, b.healthPercent ? bleedingRuneDamage(b.template,actor.maxHp,b.percent,b.stacks) : Math.round((b.raw ?? 0)*b.stacks), 0, policy, e.actors.find(a => a.id === b.source) ?? actor)]);
    if (actor.hp <= 0) break;
  }
  if (actor.hp <= 0 || !canUse(e, actor, choice.skill, now)) {
    result.canceled = true;
    if (actor.hp > 0) expireAction(e, actor, initialEffects, result.buffers);
    return result;
  }
  const targets = policy.scriptedTargets ?? ((choice.confusion ?? 0) !== confusionId(e, actor) ? selectTargets(e, actor, choice.skill) : [...choice.targets]);
  // Re-target dead reservations before activation, not between the two double-shot attacks.
  const refreshed = targets.some(id => !e.actors.some(a => a.id === id && a.hp > 0)) ? selectTargets(e, actor, choice.skill) : [];
  for (let i = 0; i < targets.length; i++) if (!e.actors.some(a => a.id === targets[i] && a.hp > 0)) targets[i] = refreshed[i % Math.max(1, refreshed.length)]!;
  if (!targets.some(id => e.actors.some(a => a.id === id && a.hp > 0))) { result.canceled = true; return result; }
  const oldSp = actor.fury, cost = effectiveCost(e, actor, choice.skill);
  const confusedRage = isRune(choice.skill) && cost > 0 && !!confusionId(e, actor);
  actor.fury = Math.max(0, Math.min(100, actor.fury + (confusedRage ? 0 : cost))); result.furyAdded = confusedRage ? 0 : cost;
  if (confusedRage) for (const id of targets) { const target=e.actors.find(a=>a.id===id)!;result.buffers.push({template_id:10111,source_id:actor.id,target_id:target.id,cur_turn:1,see_type:1,exe_way:4,damage:[fury(target,cost)]}); }
  if (cost < 0) for (const b of own(e, actor).filter(b => b.kind === "discount")) removeEffect(e, b, result.buffers);
  actor.cooldowns[choice.skill] = now + Number(skills.get(choice.skill)?.CoolDown ?? 0);
  actor.uses[choice.skill] = (actor.uses[choice.skill] ?? 0) + 1;
  const rune = actor.runes?.find(r => r.skillId === choice.skill);
  if (rune) {
    actor.cooldowns[choice.skill] = now + rune.cooldownMs;
    for (const other of actor.runes ?? []) if (other.skillId !== choice.skill) actor.cooldowns[other.skillId] = Math.max(actor.cooldowns[other.skillId] ?? 0, now + rune.commonCooldownMs);
    if (actor.uses[choice.skill]! >= rune.maxUses) {
      const limit=applyEffect(e,actor,actor,{...buffers.get(11111)!,Id:"11111",ValidCount:"-1",ValuePercent:"0",AttackValue:"0"},[],"limit");
      limit.skillIds=[...new Set([...(limit.skillIds??[]),choice.skill])];emitChange(result.buffers,limit,0);
    }
  }
  if (family(choice.skill) === 106 && actor.uses[choice.skill] === 10) {
    // Native per-skill disabling; a permanent, iconless template avoids global stun.
    const limit = applyEffect(e, actor, actor, { ...buffers.get(11111)!, Id: "11111", ValidCount: "-1", ValuePercent: "0", AttackValue: "0" }, [], "limit");
    limit.skillIds = [...new Set([...(limit.skillIds ?? []),choice.skill])]; emitChange(result.buffers, limit, 0);
  }
  if(choice.skill>=9991&&choice.skill<=9999){const row=skills.get(choice.skill)!,percent=Number(String(row.Description).match(/(\d+)%/)?.[1]??0);for(const target of e.actors.filter(a=>targets.includes(a.id)&&a.hp>0)){result.damages.push(hp(e,target,-Math.round(target.maxHp*percent/100),0,policy,actor,false,true));if(/purifica/i.test(String(row.Description)))for(const effect of own(e,target).filter(b=>b.harmful&&b.removable))removeEffect(e,effect,result.buffers);}expireAction(e,actor,initialEffects,result.buffers);e.serial++;return result;}
  const row = skills.get(choice.skill)!, heal = Number(row.CountWay) === 7, magical = isRune(choice.skill) ? actor.stats.magicAttack > actor.stats.attack : magicalSkill(choice.skill);
  const attack = magical ? actor.stats.magicAttack : actor.stats.attack;
  const f = family(choice.skill), hits = policy.hits ?? (f === 208 ? 1 : Math.max(1, Number(actions.get(Number(row.ActionId))?.AttackTimes ?? 1)));
  const outgoing = amount(e, actor, "outgoing");
  const outgoingFlat = own(e, actor).filter(b => b.kind === "outgoing").reduce((n,b)=>n+b.value*b.stacks,0);
  const incoming = new Map(e.actors.map(a => [a.id, amount(e, a, "incoming")]));
  const appliedTargets = new Set<number>();
  const impacts: { target: Actor; damage: number }[] = [];
  const permanent = actor.permanentModifiers ?? [];
  for (const id of targets) {
    if (actor.hp <= 0) break;
    const target = e.actors.find(a => a.id === id); if (!target || target.hp <= 0) continue;
    const defencePercent=own(e,target).filter(b=>b.kind==="defenceDown"&&b.type===(magical?29:28)).reduce((n,b)=>Math.max(n,b.percent),0);
    const defence = (magical ? target.stats.magicDefence : target.stats.defence)*Math.max(0,1-defencePercent/100);
    const raw = offensiveDamage(attack, defence, Math.abs(Number(row.Parameter1 ?? 100)) / 100, Number(row.Parameter2 ?? 0));
    if (heal && !isRune(choice.skill)) {
      const requested = Math.round(actor.stats.magicAttack * Math.abs(Number(row.Parameter1)) / 100 * (1 + healingBonus(actor, false) / 100) * (1 + healingBonus(target, true) / 100));
      result.damages.push(hp(e, target, -requested, 0, policy, actor, criticalHealingAllowed(row)));
    } else if (Number(row.Parameter1) !== 0 || policy.scriptedDamage) {
      // One critical/block decision per logical target attack, not per visual split.
      const bonus = f === 209 ? 15 : [210, 211].includes(f) ? 20 : 0;
      const resistances = own(e, target).filter(b => b.kind === "critResistance");
      const targetPermanent = target.permanentModifiers ?? [];
      // Retain positive explicit chance modifiers. Negative type-31 effects and
      // cosmos reductions share one additive reduction category after the cap.
      const chanceBonus = bonus + resistances.reduce((n,b)=>n+Math.max(0,b.value),0);
      const reduction = (resistances.reduce((n,b)=>n+Math.max(0,-b.value),0) +
        targetPermanent.filter(m=>m.kind === "criticalAvoidancePoints").reduce((n,m)=>n+Math.abs(m.magnitude),0))/100;
      const critical = !policy.scriptedDamage && !permanent.some(m => m.cannotCritical) && random(e) < criticalChance(actor.stats.critical,target.stats.level,chanceBonus,actor.stats.level,reduction);
      const blocked = !policy.scriptedDamage && random(e) < blockChance(target.stats.block, actor.stats.penetration, target.stats.level);
      const total = Math.max(1,resolveDamage(permanentDamage(raw, critical, blocked, permanent, targetPermanent, () => random(e), {attacker:actor.stats,defender:target.stats}), false, false, outgoing, incoming.get(target.id) ?? 0)+outgoingFlat);
      for (let hit = 0; hit < hits; hit++) {
        if (target.hp <= 0 && !policy.scriptedDamage) break;
        let requested = policy.scriptedDamage ? policy.scriptedDamage(target, hit) : Math.max(1, Math.round(total * (hit + 1) / hits) - Math.round(total * hit / hits));
        if(!policy.scriptedDamage)requested=battlePressureDamage(e,requested);
        if (!policy.scriptedDamage && targetPermanent.filter(m => m.kind === "damageImmunityChance").some(m => modifierActivates(m, () => random(e)))) requested = 1;
        // Absolute final impact, before shields and remaining-HP clipping.
        if (!policy.suppressTriggers && !policy.scriptedDamage) impacts.push({ target, damage: requested });
        for (const b of own(e, target).filter(b => b.kind === "shield")) {
          const absorbed = Math.min(Math.max(0, requested), b.shield ?? 0); requested -= absorbed; b.shield = (b.shield ?? 0) - absorbed;
          emitChange(result.buffers, b, 1);
          if (!b.shield) removeEffect(e, b, result.buffers);
        }
        const impact = hp(e, target, requested, f === 208 ? result.damages.length : hit, policy, actor, false, true); impact.extra_data = critical ? 1 : 0; impact.parry = blocked; result.damages.push(impact);
        if (!policy.suppressTriggers && impact.damage_value > 0) {
          passives(e, actor, "damage", result.buffers, policy);
          if (critical) passives(e, actor, "critical", result.buffers, policy);
        }
      }
      if (!policy.suppressTriggers && blocked) passives(e, target, "block", result.buffers, policy);
    }
    if (actor.hp > 0 && !appliedTargets.has(id)) { applySkillEffects(e, actor, target, choice.skill, raw, result.buffers, policy); appliedTargets.add(id); }
  }
  if (!policy.suppressTriggers && !policy.scriptedDamage) {
    const emitPermanent = (source: Actor, target: Actor, m: PermanentModifiers[number], value: number): void => {
      result.buffers.push({ buffer_id: ++e.effectSequence, template_id: m.origin.bufferId, source_id: source.id, target_id: target.id,
        cur_turn: 1, max_turn: 1, pressed_num: 1, see_type: 1, exe_way: 4,
        damage: [hp(e, target, value, 0, policy, source, false, true)] });
    };
    // Finish the entire attack first; reflected damage never re-enters this executor.
    for (const impact of impacts) {
      if (actor.hp <= 0) break;
      if (impact.target.hp <= 0) continue;
      for (const b of own(e, impact.target).filter(b => b.kind === "reflect")) {
        if (actor.hp <= 0) break;
        emitChange(result.buffers, b, 1, [hp(e, actor, Math.round(impact.damage * b.percent * b.stacks / 100), 0, policy, impact.target, false, true)]);
      }
      for (const m of impact.target.permanentModifiers ?? []) {
        if (actor.hp <= 0) break;
        if (m.kind === "reflect" && modifierActivates(m, () => random(e))) emitPermanent(impact.target, actor, m, modifierAmount(m, impact.damage));
      }
    }
    for (const impact of impacts) {
      if (actor.hp <= 0) break;
      for (const id of ids(row.BufferIds)) {
        const b = buffers.get(id);
        if (Number(b?.AttackType) === 21) result.buffers.push({ template_id: id, source_id: actor.id, target_id: actor.id,
          cur_turn: 1, see_type: 1, exe_way: 4,
          damage: [hp(e, actor, -Math.round(impact.damage * Math.abs(Number(b!.ValuePercent)) / 100), 0, policy)] });
      }
      for (const m of permanent) if ((m.kind === "lifeSteal" || m.kind === "healOnAttack") && modifierActivates(m, () => random(e))) emitPermanent(actor, actor, m, -modifierAmount(m, impact.damage));
    }
  }
  if (!policy.suppressTriggers) passives(e, actor, "action", result.buffers, policy);
  if(!policy.suppressTriggers&&actor.hp>0)for(const modifier of permanent.filter(m=>m.kind==="furyOnAction")){
    result.buffers.push({template_id:modifier.origin.bufferId,source_id:actor.id,target_id:actor.id,cur_turn:-1,max_turn:-1,see_type:1,exe_way:1,pressed_num:1,isPermanent:true,damage:[fury(actor,modifier.magnitude)]});
  }
  if (policy.scriptedFury !== undefined) actor.fury = policy.scriptedFury;
  if (actor.hp > 0) for (const b of own(e, actor).filter(b => b.kind === "healAction" && initialEffects.includes(b.id))) emitChange(result.buffers, b, 1, [hp(e, actor, -Math.round(actor.maxHp * b.percent * b.stacks / 100), 0, policy, e.actors.find(a => a.id === b.source) ?? actor)]);
  expireAction(e, actor, initialEffects, result.buffers);
  if(!policy.suppressTriggers&&!policy.scriptedDamage)finishFateTurn(e,actor,impacts.map(i=>i.target),result.buffers);
  if(!policy.suppressTriggers&&!policy.scriptedDamage)for(const fallen of e.actors.filter(a=>a.hp<=0)){const owner=e.actors.find(a=>a.hp>0&&a.side===fallen.side&&a.marriage?.partner===fallen.id);const skill=owner?.marriage?.passive.find(id=>(owner.uses[id]??0)===0);if(!owner||!skill)continue;const text=String(skills.get(skill)?.Description??''),percent=Number(text.match(/(\d+)%/)?.[1]??0),sp=Number(text.match(/(\d+) pontos/)?.[1]??0);if(!percent)continue;owner.uses[skill]=1;fallen.hp=Math.max(1,Math.round(fallen.maxHp*percent/100));fallen.fury=Math.min(100,fallen.fury+sp);(result.revives??=[]).push({living_id:fallen.id,hp:fallen.hp,sp:fallen.fury});result.frames+=48;}
  result.furyAdded = actor.fury - oldSp; e.serial++;
  return result;
}

/** New fate buffs cannot affect the action that rolled them. One subsequent attack consumes them. */
function finishFateTurn(e:Engine,actor:Actor,targets:Actor[],list:Message[]):void{
  const hit=[...new Map(targets.map(t=>[t.id,t])).values()];
  // Remove only the effects already present during this attack, before rolling replacements.
  for(const target of hit)for(const b of [...own(e,target)].filter(b=>b.fate))removeEffect(e,b,list);
  const players=e.players??[e.hero];
  if(!players.includes(actor.id))return;
  const victims=hit.filter(t=>players.includes(t.id)&&t.side!==actor.side);
  if(!victims.length)return;
  const grant=(source:Actor,target:Actor,kind:Effect["kind"],id:number,type:number,percent:number)=>{
    if(source.hp<=0||target.hp<=0)return;
    const base=buffers.get(id)??{};
    const row={...base,Id:String(id),AttackType:String(type),ValidCount:"1",PressCount:"1",ValuePercent:String(percent),AttackValue:"0"};
    const b=applyEffect(e,source,target,row,list,kind);b.fate=true;b.harmful=kind==="defenceDown";
  };
  for(const target of victims){
    const destruction=(actor.permanentModifiers??[]).find(m=>m.kind==="fateIgnoreDefence");
    if(destruction&&actor.hp>0&&target.hp>0&&modifierActivates(destruction,()=>random(e))){
      const level=destruction.magnitude;grant(actor,target,"defenceDown",2000+level,28,level);grant(actor,target,"defenceDown",2100+level,29,level);
    }
    for(const m of target.permanentModifiers??[]){
      if(target.hp<=0||!["fateReduction","fateReflect"].includes(m.kind)||!modifierActivates(m,()=>random(e)))continue;
      grant(target,target,m.kind==="fateReduction"?"incoming":"reflect",(m.kind==="fateReduction"?2200:2300)+m.magnitude,m.kind==="fateReduction"?15:24,m.kind==="fateReduction"?-m.magnitude:m.magnitude);
    }
  }
}
