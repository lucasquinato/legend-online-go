import { randomUUID, randomBytes } from "node:crypto";
import type { Message } from "../../messages.js";
import { pawnTemplates, pawnValue } from "../settlement/content.js";
import { campaignHeroNumbers, campaignPawnNumbers } from "../campaign/content.js";
import type { CityPacket, CityState, CityPatch } from "../../city-state.js";
import { actorBuffers, choose, createEngine, execute, initializePassives, initializeRuneCooldowns, makeActor, populateAutomatic, type Engine, type Stats } from "./engine.js";
import { heroRows, pawnRows, skills, ids } from "./content.js";
import { type OpeningState } from "./timing.js";
import { startInitiative, advanceInitiative, takeInitiativeChoice, spendInitiative, nextInitiativeAt, pauseInitiative, resumeInitiative, initiativeWait, initiativeCost } from "./initiative.js";
import { enableBattlePressure, battlePressureNotice, battlePressureRemaining, syncBattlePressure, battlePressureSteps } from "./pressure.js";
import type { PermanentModifiers } from "./permanent-modifiers.js";
import { applyBattleEquipmentAppearance } from "../equipment/appearance.js";
import { runeBattleContract, type BattleRune } from "../runes/index.js";

import { equippedBattleSkills } from "./tactical-ai.js";

export interface AdventureReference {
  prepare: Message; actions: Message[]; finish: Message; rewards: CityPacket[];
  rewardPatches?: CityPatch[]; heroStats?: Message; tableCombat?: boolean; enemyStats?: Record<string, Message>;
}
export interface AdventureBattle extends OpeningState {
  victory?: "all-heroes";
  id: string; reference: number; prepare: Message; fighters: Message[]; hero: number; sp: number;
  selected?: number; cooldowns: Record<string, number>; ready: boolean; paused: boolean; started: boolean;
  finished: boolean; won?: boolean; turn: number; frame: number; nextAt: number;
  engine?: Engine; finishing?: boolean;
  runes?: BattleRune[];
  attackScale?: number; defenceScale?: number; troopScales?: Record<string, number>;
  stats?: Record<string, Partial<Stats>>;
  actionUntil?:number; frameClock?:{at:number;frame:number};
}
export function createAdventure(ref: AdventureReference, index: number, state: CityState, initialSp?: number, permanentModifiers: PermanentModifiers = []): AdventureBattle {
  const prepare = structuredClone(ref.prepare), hero = prepare.heros.find((h: Message) => h.type === 1)!;
  // Flash reads hp2.high/low unconditionally (Int64Utils); omitted Int64s are null.
  // Captured PvE references supplied these fields, but server-built references must too.
  for (const h of prepare.heros) for (const [key, fallback] of Object.entries({
    hp2: 0, init_hp2: 0, cloak_path: "", res: "", server_name: "", is_show: false,
  })) if (h[key] === undefined || h[key] === null) h[key] = fallback;
  const learned = String(state.hero.skill_script).split(",").map(Number).filter(id => skills.has(id));
  const active = learned.filter(id => Number(skills.get(id)?.UseWay) === 1);
  const runes = runeBattleContract(state);
  Object.assign(hero, {
    skillId: [...learned, ...runes.map(r => r.skillId)], hp: Number(state.hero.total_live), init_hp: Number(state.hero.total_live), max_hp: Number(state.hero.total_live),
    sp: Math.max(0, Math.min(100, initialSp ?? Number(state.hero.total_initial_fury ?? 0))), temp_id: state.hero.tempate_id, head_id: state.hero.tempate_id,
    hero_id: state.player.player_id, user_id: state.player.player_id, user_pics: state.hero.tempate_id,
    nick_name: state.hero.nick_name, grade: state.player.grades, captain: state.hero.total_captain,
    pos: Number(state.hero.fight_pos) === 1 ? 4 : 6,
  });
  applyBattleEquipmentAppearance(hero, state.army);
  const troop = (state.army.armyPawn ?? []).find((p: Message) => p.own_pawns > 0);
  if (!troop) prepare.soldiers = (prepare.soldiers ?? []).filter((p: Message) => p.side !== 1);
  else for (const [i, soldier] of (prepare.soldiers ?? []).filter((p: Message) => p.side === 1).entries()) {
    const row = pawnTemplates.get(troop.tempate_id);
    soldier.temp_id = troop.tempate_id; soldier.skillId = [Number(row?.DefaultSkill ?? 10)];
    soldier.hp = soldier.init_hp = pawnValue(troop, 4);
    soldier.pos = (Number(troop.fight_pos) === 3 ? 3 : 1) + (i % 2) * 9;
    soldier.grade = Number(row?.Level ?? state.player.grades);
  }
  for (const [dest, source] of Object.entries({ wing_avata: "wing", hat_avata: "hat", fashion_arm_avata: "fashion_arm", fashion_cloth_avata: "fashion_cloth" })) hero[dest] = state.army[source] ?? "";
  hero.hair_path = state.army.hat ?? "";
  prepare.coolDown = active.map(id => ({ templated_id: id, cool_down: 0, cool_type: 1, appear_cool_down: 0 }));
  prepare.coolDown.push(...runes.map(r => ({templated_id:r.skillId,cool_down:r.openingCooldownMs,cool_type:1,appear_cool_down:r.openingCooldownMs})));
  prepare.battle_id = randomUUID(); prepare.attack_model = 0;
  const fighters: Message[] = [...(prepare.heros ?? []), ...(prepare.soldiers ?? [])].map(h => ({ ...h, max_hp: h.max_hp ?? h.init_hp }));
  const stats: Record<string, Stats> = {};
  const rejects: Record<number, number[]> = {};
  for (const f of fighters) {
    const numbers = ref.enemyStats?.[f.temp_id] ?? campaignHeroNumbers[f.temp_id] ?? campaignPawnNumbers[f.temp_id] ?? heroRows.get(f.temp_id) ?? pawnRows.get(f.temp_id);
    rejects[f.living_id] = ids(numbers?.RejectType);
    stats[f.living_id] = f.living_id === hero.living_id ? {
      attack: Number(state.hero.total_phy_attack), magicAttack: Number(state.hero.total_magic_attack),
      defence: Number(state.hero.total_phy_defence), magicDefence: Number(state.hero.total_magic_defence),
      critical: Number(state.hero.total_force_hit ?? 0), block: Number(state.hero.total_parry ?? 0),
      penetration: Number(state.hero.total_penetrate ?? 0), level: state.player.grades,
    } : {
      attack: Number(numbers?.Attack ?? 0), magicAttack: Number(numbers?.MagicAttack ?? 0),
      defence: Number(numbers?.Defence ?? 0), magicDefence: Number(numbers?.MagicDefence ?? 0),
      critical: Number(numbers?.ForceHit ?? 0), block: Number(numbers?.Parry ?? 0), penetration: Number(numbers?.Penetrate ?? 0), level: Math.max(1, Number(f.grade ?? numbers?.Level ?? 1)),
    };
    if (f.side === 1 && f.living_id !== hero.living_id && troop) Object.assign(stats[f.living_id]!, {
      attack: pawnValue(troop, 0), defence: pawnValue(troop, 1), magicAttack: pawnValue(troop, 2), magicDefence: pawnValue(troop, 3), critical: pawnValue(troop, 5),
    });
    f.buffers = [];
  }
  const engine = createEngine(fighters.map(f => makeActor(f, stats[f.living_id] ?? {}, f.living_id === hero.living_id ? (((Number(hero.temp_id) - 1) % 3) + 1) * 10000 : undefined)), hero.living_id, randomBytes(4).readUInt32LE());
  for (const actor of engine.actors) actor.rejects = rejects[actor.id] ?? [];
  engine.actors.find(a => a.id === engine.hero)!.permanentModifiers = structuredClone(permanentModifiers);
  engine.actors.find(a => a.id === engine.hero)!.runes = structuredClone(runes);
  engine.actors.find(a => a.id === engine.hero)!.equippedSkills = equippedBattleSkills(learned, state.hero.fast_key);
  initializePassives(engine);
  const b: AdventureBattle = { id: prepare.battle_id, reference: index, prepare, fighters, hero: hero.living_id, sp: hero.sp, cooldowns: {}, ready: false, paused: false, started: false, finished: false, turn: 0, frame: 27, nextAt: 0, stats, engine };
  b.runes = structuredClone(runes); syncBattle(b); return b;
}
/** Upgrade only transient battle state, preserving account progress. */
export function ensureEngine(b: AdventureBattle): Engine {
  if (!b.engine) {
    const actors = b.fighters.map(f => makeActor(f, b.stats?.[f.living_id] ?? {}, f.living_id === b.hero ? (((Number(f.temp_id) - 1) % 3) + 1) * 10000 : undefined));
    b.engine = createEngine(actors, b.hero, randomBytes(4).readUInt32LE()); initializePassives(b.engine);
  }
  b.engine.battleId = b.id;
  const hero = b.engine.actors.find(a => a.id === b.hero)!;
  if (b.runes) hero.runes = structuredClone(b.runes);
  for (const f of b.fighters) {
    const actor = b.engine.actors.find(a => a.id === f.living_id);
    if (actor) { actor.hp = Number(f.hp); actor.maxHp = Math.max(Number(f.max_hp ?? actor.maxHp), actor.hp); }
  }
  hero.fury = b.sp; hero.cooldowns = b.cooldowns; return b.engine;
}
export function migrateAdventure(b: AdventureBattle, ref: AdventureReference, state: CityState, permanentModifiers: PermanentModifiers = []): void {
  if (b.engine || b.finished) return;
  const fresh = createAdventure(ref, b.reference, state, undefined, permanentModifiers);
  for (const f of fresh.fighters) {
    const old = b.fighters.find(h => h.living_id === f.living_id);
    if (old) f.hp = Math.max(0, Math.min(Number(f.max_hp), Number(old.hp)));
  }
  fresh.prepare.battle_id = b.id;
  Object.assign(b, { prepare: fresh.prepare, fighters: fresh.fighters, stats: fresh.stats, engine: fresh.engine, runes: fresh.runes });
  ensureEngine(b); syncBattle(b);
}
export function syncBattle(b: AdventureBattle, now?:number): void {
  if (!b.engine) return;
  syncBattlePressure(b.engine,b.prepare);
  for (const f of b.fighters) { const a = b.engine.actors.find(a => a.id === f.living_id)!; f.hp = a.hp; f.max_hp = a.maxHp; f.sp = a.fury; f.buffers = actorBuffers(b.engine, a.id); }
  const hero = b.engine.actors.find(a => a.id === b.hero)!; b.sp = hero.fury; b.cooldowns = hero.cooldowns;
  b.prepare.attack_model = hero.autoBattle ? 1 : 2;
  const wireHero=b.prepare.heros.find((h:Message)=>h.living_id===b.hero);
  if (wireHero) wireHero.item=(hero.runes??[]).map(r=>({userId:hero.id,battleId:b.id,uItemId:r.runeId,tempId:r.runeId,bagPos:r.slot,skillTempId:r.skillId,count:Math.max(0,r.maxUses-(hero.uses[r.skillId]??0)),sonType:91}));
  for(const model of [...b.fighters,...(b.prepare.heros??[]),...(b.prepare.soldiers??[])]){
    const a=b.engine.actors.find(a=>a.id===model.living_id);if(!a)continue;
    model.cast_time=now!==undefined&&b.engine.initiative?initiativeWait(b.engine,a.id,now):initiativeCost(a.defaultSkill);
    model.qte_time=0;
  }
}
export function adventureSkill(b: AdventureBattle, skill: number, now: number): boolean {
  if (!b.ready || b.finished || b.finishing || b.paused) return false;
  const selected = choose(ensureEngine(b), b.hero, skill, now); if (!selected) return false;
  b.nextAt=Math.max(b.actionUntil??now,Math.min(b.nextAt,selected.readyAt??now));
  b.prepare.attack_model = 2; b.selected = skill; return true;
}
export function adventureTargets(b: AdventureBattle): number[] { return b.engine?.queue.find(c => c.actor === b.hero)?.targets ?? []; }
export function adventureSelection(b:AdventureBattle,actorId:number,skill:number,accepted:boolean,now:number):Message {
  const c=b.engine?.queue.find(c=>c.actor===actorId);
  return {battle_id:b.id,hero_index_id:actorId,skill_id:skill,result:accepted?0:1,
    cast_time:accepted&&b.engine?initiativeWait(b.engine,actorId,now):0,qte_time:0,targetIndexs:accepted?c?.targets??[]:[]};
}
export function readyAdventure(b: AdventureBattle, now: number): void {
  const e=ensureEngine(b);initializeRuneCooldowns(e,now);
  if(b.ready&&!b.paused)return;
  if(e.initiative){
    if(!b.ready&&e.initiative.pausedAt===undefined)pauseInitiative(e,e.initiative.lastAt);
    const shift=resumeInitiative(e,now);
    if(b.actionUntil!==undefined)b.actionUntil+=shift;
  }else startInitiative(e,now);
  b.ready = true; b.paused = false;
  b.frameClock=undefined;
  enableBattlePressure(e);
  // The next prepare recreates the client's model with the current total.
  e.pressure!.notifiedSteps=battlePressureSteps(e);
  delete e.pressure!.resync;
  populateAutomatic(e,now);
  b.nextAt=Math.max(b.actionUntil??now,nextInitiativeAt(e,now));
  syncBattle(b,now);
}
export function setAdventurePaused(b:AdventureBattle,paused:boolean,now:number):void {
  const e=ensureEngine(b);
  if(paused){pauseInitiative(e,now);b.paused=true;return;}
  const shift=resumeInitiative(e,now);
  if(b.actionUntil!==undefined)b.actionUntil+=shift;
  if(b.frameClock)b.frameClock.at+=shift;
  b.nextAt+=shift;b.paused=false;
}
export function advanceAdventure(b: AdventureBattle, _ref: AdventureReference, now: number): CityPacket[] {
  if (!b.ready || b.paused || b.finished) return [];
  const e = ensureEngine(b), events: CityPacket[] = [];
  if(!e.initiative)startInitiative(e,now);
  enableBattlePressure(e);
  advanceInitiative(e,now);
  if(!b.finishing){const notice=battlePressureNotice(e,b.id);if(notice)events.push({opcode:4361,message:notice});}
  if(now<(b.actionUntil??0))return events;
  if (b.finishing) {
    b.finished = true;
    events.push({ opcode: 154, message: { frame: b.frame, prepareOverLivings: e.actors.filter(a => a.hp > 0 && a.side === (b.won ? 1 : 2)).map(a => ({ calc_type: 3, living_id: a.id, sp: a.fury })) } }); return events;
  }
  populateAutomatic(e, now);
  const choice = takeInitiativeChoice(e,now);
  if(!choice){b.nextAt=nextInitiativeAt(e,now);return events;}
  b.openingComplete=true;
  if (!b.started) { b.started = true; events.push({ opcode: 156, message: { frame: b.frame, mainType: b.prepare.battle_type, count_down: battlePressureRemaining(e) } }); }
  b.frameClock??={at:now,frame:b.frame};
  b.frame=Math.max(b.frame,b.frameClock.frame+Math.floor((now-b.frameClock.at)/40));
  if (choice.actor === b.hero) b.selected = undefined;
  const resolution = execute(e, choice, now); b.turn++;
  const actor = e.actors.find(a => a.id === choice.actor)!;
  if (choice.automatic && actor.autoBattle && !resolution.canceled) events.push({opcode:75,message:{
    battle_id:b.id,hero_index_id:actor.id,skill_id:choice.skill,result:0,cast_time:0,qte_time:0,targetIndexs:choice.targets,
  }});
  const rune=actor.runes?.find(r=>r.skillId===choice.skill);
  if(rune) events.push({opcode:158,message:{uItemId:rune.runeId,bagPos:rune.slot,count:Math.max(0,rune.maxUses-(actor.uses[rune.skillId]??0)),result:resolution.canceled?1:0,living_id:actor.id,temp_id:rune.skillId,type:1}});
  for (const buffer of resolution.buffers) buffer.exec_frame = b.frame;
  if (resolution.canceled && !choice.automatic && (e.players ?? [b.hero]).includes(choice.actor)) {
    // Clear the client's reserved skill; no cooldown/cost is issued for the lost turn.
    events.push({ opcode: 75, message: {
      battle_id: b.id, hero_index_id: choice.actor, skill_id: choice.skill,
      result: 1, cast_time: 0, qte_time: 0, targetIndexs: [],
    } });
  }
  events.push({ opcode: 153, message: {
    battle_id: b.id, frame: b.frame, exec_frame: b.frame, frame_num: resolution.canceled ? 1 : resolution.frames,
    // Order 0 maps to EmptyActionSkill in the client. is_passive alone does not.
    order_id: resolution.canceled ? 0 : resolution.skill, living_id: resolution.actor, is_passive: resolution.canceled,
    waitRevives:(resolution.revives??[]).map(r=>({...r,battle_id:b.id})),
    sp: actor.fury, sp_added: resolution.furyAdded, damages: resolution.damages, buffers: resolution.buffers,
    awakenSoldiers: [], awake: 0, hitPoint: 0, attackOrderSeq: e.serial,
    attack_millis: new Date(now).toISOString().slice(0, 19).replace("T", " "),
    $20: { wire: 0, value: String(b.turn) }, $21: { wire: 0, value: "0" },
  } });
  syncBattle(b);
  // Wait for this animation instead of precomputing a round.
  const frames = resolution.canceled ? 1 : resolution.frames;
  spendInitiative(e,choice.actor,now,frames*40);
  b.frame += frames; b.nextAt = b.actionUntil = now + frames * 40;
  const hero = e.actors.find(a => a.id === b.hero)!;
  const sideOneAlive=b.victory==="all-heroes"?e.actors.some(a=>a.side===1&&a.hp>0):hero.hp>0;
  if (!sideOneAlive || !e.actors.some(a => a.side === 2 && a.hp > 0)) { b.finishing = true; b.won = sideOneAlive; }
  return events;
}
