import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./config.js";
import { type Message } from "./messages.js";
import { applyHealth } from "./features/battle/mechanics.js";
import { createEngine, execute, makeActor, choose, type Engine } from "./features/battle/engine.js";
import { startInitiative, advanceInitiative, spendInitiative, initiativeWait, pauseInitiative, resumeInitiative } from "./features/battle/initiative.js";
import { evaluateBattleActions } from "./features/battle/tactical-ai.js";
import { setBattleAutomatic } from "./features/battle/automatic.js";
import { beginOpening, openingReady, type OpeningState } from "./features/battle/timing.js";
import { calculateAttributes, naturalAttributeSource, type AttributeState } from "./attributes.js";
import { initialEquipmentSource } from "./features/attributes/initial-equipment.js";
import { syncSkillAttributes } from "./features/skills/index.js";

type Row = Record<string, string>;
const tables = JSON.parse(
  readFileSync(join(projectRoot, "reference/game-tables.json"), "utf8"),
) as { SkillTempInfos: Row[]; GameHeroTemp: Row[]; ActionTempInfos: Row[] };
export const heroTemplates = new Map(
  tables.GameHeroTemp.map((r) => [Number(r.TemplateId), r]),
);
export const skillTemplates = new Map(
  tables.SkillTempInfos.map((r) => [Number(r.TemplateId), r]),
);
export const actionTemplates = new Map(
  tables.ActionTempInfos.map((r) => [Number(r.ActionId), r]),
);
export const combatReference = JSON.parse(
  readFileSync(join(projectRoot, "reference/tutorial-combat.json"), "utf8"),
) as {
  initialHero: Message;
  cityHero: Message;
  encounters: { prepare: Message; actions: Message[]; finish: Message }[];
};
export function classForIcon(icon: number): number {
  const hero = heroTemplates.get(icon);
  if (!hero) throw new Error("Personagem inválido");
  return Number(hero.Job);
}
export function skillsFor(icon: number, encounter: number): number[] {
  const job = classForIcon(icon);
  return [
    job * 10000 + 711,
    job * 10000 + 811,
    ...(encounter === 2 ? [job * 10000 + 1011] : []),
  ];
}
export const BALANCE_VERSION = 4;
export function tutorialGrade(wins: number[], cityEntered: boolean): number {
  return cityEntered || wins.includes(1) ? 10 : wins.includes(0) ? 2 : 1;
}
export function heroStats(icon: number, grade: number, equipment?: Message[]) {
  const job = classForIcon(icon);
  const ledger: AttributeState = { version: 1, calculationVersion: 2, sources: {} };
  if (grade >= 10) ledger.sources.natural = naturalAttributeSource(job, grade);
  else {
    // The two authored tutorial lessons use their captured base budget. Primary
    // conversion still belongs to the central calculator, not this combat adapter.
    const values: Record<string, number> = {};
    for (const prefix of ["base", "total"]) {
      for (const key of ["power", "agility", "intellect", "physique"]) values[`${prefix}_${key}`] = 5;
      values[`${prefix}_captain`] = grade === 2 ? 110 : 100;
      values[`${prefix}_live`] = grade === 2 ? 130 : 100;
      values[`${prefix}_force_hit`] = values[`${prefix}_parry`] = 10;
    }
    ledger.sources.natural = { kind: "natural", evidence: "captured-base", values, derivePrimary: true };
  }
  if (grade >= 10) {
    const initial = equipment ?? [
      { template_id: [1011003,1012003,1013003][job-1], random_skill_1:70102, random_skill_2:70904, random_skill_3:70402 },
      { template_id: [1041003,1042003,1043003][job-1], random_skill_1:70605, random_skill_2:71106, random_skill_3:70502 },
    ];
    for (const [i, item] of initial.entries()) {
      const source = initialEquipmentSource(item);
      if (source) ledger.sources[`equipment:initial:${i}`] = source;
    }
  }
  const learned = [...skillsFor(icon, grade >= 10 ? 2 : 0), ...(grade >= 10 && job === 3 ? [30111,30211] : [])];
  syncSkillAttributes({ version:1,job,active:0,unlocked:false,pages:[{learned,keys:""}] },ledger);
  const source = calculateAttributes(ledger);
  const attributes = [
    "power",
    "agility",
    "intellect",
    "captain",
    "physique",
    "phy_attack",
    "magic_attack",
    "phy_defence",
    "magic_defence",
    "force_hit",
    "parry",
    "conat_army",
    "live",
  ] as const;
  const base: Record<string, number> = {},
    total: Record<string, number> = {};
  for (const key of attributes) {
    base[key] = Number(source[`base_${key}`]);
    total[key] = Number(source[`total_${key}`]);
  }
  return {
    ...total,
    base,
    total,
    power: total.power!,
    agility: total.agility!,
    intellect: total.intellect!,
    captain: total.captain!,
    physique: total.physique!,
    phy_attack: total.phy_attack!,
    magic_attack: total.magic_attack!,
    phy_defence: total.phy_defence!,
    magic_defence: total.magic_defence!,
    force_hit: total.force_hit!,
    parry: total.parry!,
    conat_army: total.conat_army!,
    live: total.live!,
    primaryAttack: job === 3 ? total.magic_attack! : total.phy_attack!,
    defence: job === 3 ? total.magic_defence! : total.phy_defence!,
    capacity: Number(source.fighting_capacity),
  };
}
export interface Fighter {
  id: number;
  side: number;
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
  skill: number;
}
export interface Battle extends OpeningState {
  balanceVersion?: number;
  id: string;
  encounter: number;
  hero: number;
  job: number;
  sp: number;
  skills: number[];
  fighters: Fighter[];
  cooldowns: Record<string, number>;
  frame: number;
  turn: number;
  actionIndex?: number;
  ready: boolean;
  paused: boolean;
  started: boolean;
  finished: boolean;
  won?: boolean;
  nextTurnAt: number;
  selected?: number;
  autoBattle?: boolean;
  prepare: Message;
  reinforcementsSpawned?: boolean;
  engine?: Engine;
}
export interface BattleEvent {
  opcode: number;
  message: Message;
  delayMs: number;
}
function fighter(
  h: Message,
  stats: ReturnType<typeof heroStats>,
  hero: number,
  job: number,
): Fighter {
  return {
    id: h.living_id,
    side: h.side,
    hp: h.hp,
    maxHp: h.max_hp ?? h.init_hp,
    attack: h.living_id === hero ? stats.primaryAttack : 0,
    defence: h.living_id === hero ? stats.defence : 0,
    skill: h.living_id === hero ? job * 10000 : (h.skillId?.[0] ?? 0),
  };
}
export function createBattle(
  prepare: Message,
  encounter: number,
  icon: number,
  uid: number,
  nickname: string,
  equipment?: Message[],
): Battle {
  prepare = structuredClone(prepare);
  const job = classForIcon(icon),
    skills = skillsFor(icon, encounter);
  const player = prepare.heros.find((h: Message) => h.type === 1);
  if (!player) throw new Error("Encontro sem herói do jogador");
  Object.assign(player, {
    hero_id: uid,
    user_id: uid,
    nick_name: nickname,
    user_pics: icon,
    temp_id: icon,
    head_id: icon,
    skillId: [
      ...skills,
      ...(encounter === 2 && job === 3 ? [30111, 30211] : []),
    ],
  });
  if (job !== 3) player.buffers = [];
  prepare.battle_id = randomUUID();
  prepare.coolDown = skills.map((id) => ({
    templated_id: id,
    cool_down: 0,
    cool_type: 1,
    appear_cool_down: 0,
  }));
  const stats = heroStats(icon, player.grade, equipment);
  Object.assign(player, { hp: stats.live, init_hp: stats.live, max_hp: stats.live, captain: stats.captain });
  return {
    balanceVersion: BALANCE_VERSION,
    id: prepare.battle_id,
    encounter,
    hero: player.living_id,
    job,
    sp: player.sp,
    skills,
    fighters: [...(prepare.heros ?? []), ...(prepare.soldiers ?? [])].map((h) =>
      fighter(h, stats, player.living_id, job),
    ),
    cooldowns: {},
    frame: 27,
    turn: 0,
    actionIndex: 0,
    ready: false,
    paused: false,
    started: false,
    finished: false,
    nextTurnAt: 0,
    prepare,
  };
}
export function migrateBattleBalance(b: Battle, icon: number, equipment?: Message[]): void {
  if (b.balanceVersion === BALANCE_VERSION) return;
  if (b.finished) {
    b.balanceVersion = BALANCE_VERSION;
    return;
  }
  const oldPlayer = b.prepare.heros.find(
    (h: Message) => h.living_id === b.hero,
  );
  const fresh = createBattle(
    combatReference.encounters[b.encounter]!.prepare,
    b.encounter,
    icon,
    oldPlayer.user_id,
    oldPlayer.nick_name,
    equipment,
  );
  fresh.id = b.id;
  fresh.prepare.battle_id = b.id;
  // Replay the current encounter's narrative from its beginning, keeping objectives
  // and the session's battle UUID; old v2 actors have no reinforcement phase to resume.
  Object.assign(b, fresh);
}
export function selectSkill(
  b: Battle,
  battleId: string,
  hero: number,
  skill: number,
  now: number,
): BattleEvent {
  let rejected =
    b.id !== battleId ||
    b.hero !== hero ||
    !b.ready ||
    b.finished ||
    b.paused ||
    !b.skills.includes(skill) ||
    (b.cooldowns[skill] ?? 0) > now ||
    b.sp + Number(skillTemplates.get(skill)?.Cost ?? -1000) < 0;
  if(!rejected){
    const e=tutorialEngine(b);startInitiative(e,now);
    rejected=!choose(e,b.hero,skill,now);
  }
  if (!rejected) {
    b.autoBattle = false;
    if (b.engine) setBattleAutomatic(b.engine, b.hero, false);
    b.prepare.attack_model = 2;
    b.selected = skill;
    if (!b.openingComplete) b.nextTurnAt = now;
  }
  return {
    opcode: 75,
    message: {
      battle_id: battleId,
      hero_index_id: hero,
      skill_id: skill,
      result: rejected ? 1 : 0,
      cast_time: rejected?0:initiativeWait(b.engine!,b.hero,now),
      qte_time: 0,
      targetIndexs: rejected ? [] : targetsFor(b, skill).map((f) => f.id),
    },
    delayMs: 0,
  };
}
function targetsFor(b: Battle, skill: number): Fighter[] {
  const enemies = b.fighters.filter((f) => f.side === 2 && f.hp > 0);
  if (
    b.encounter === 1 &&
    enemies.find((f) => f.id === 2)?.hp === 1 &&
    enemies.some((f) => f.id !== 2)
  )
    enemies.sort((a, c) => Number(a.id === 2) - Number(c.id === 2));
  if (b.job === 3 && skill % 10000 === 811) return enemies;
  if (b.job === 1 && skill % 10000 === 811)
    return enemies.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp).slice(0, 1);
  // The recorded mage targeted the rear soldier first.
  return (b.encounter === 0 ? enemies.reverse() : enemies).slice(0, 1);
}
function hpFloor(b: Battle, target: Fighter, actor: Fighter): number {
  if (target.side === 1) return 1; // Tutorial actors cannot die, including Sofia.
  if (b.encounter === 1 && target.id === 2 && actor.id === b.hero) return 1;
  if (b.encounter === 2 && target.id === 1 && b.turn < 2) return 1;
  return 0;
}
function applyDamage(
  b: Battle,
  actor: Fighter,
  target: Fighter,
  requested: number,
  template: Message = {},
): Message {
  const { display: value } = applyHealth(target, requested, hpFloor(b, target, actor));
  return {
    ...template,
    living_id: target.id,
    damage_type: 6,
    damage_value: value,
    left_value: target.hp,
    order: template.order ?? 0,
  };
}
function actionMessage(b: Battle, source: Message, now: number): Message {
  const m = structuredClone(source);
  m.battle_id = b.id;
  m.frame = m.exec_frame = b.frame;
  m.attack_millis = new Date(now).toISOString().slice(0, 19).replace("T", " ");
  m.$20 = { wire: 0, value: String(b.turn + 1) };
  if (b.job !== 3)
    m.buffers = (m.buffers ?? []).filter((x: Message) => !x.template_id);
  return m;
}
function npcAction(
  b: Battle,
  source: Message,
  now: number,
): BattleEvent | undefined {
  const actor = b.fighters.find((f) => f.id === source.living_id);
  if (!actor || actor.hp <= 0) return;
  const m = actionMessage(b, source, now);
  m.damages = (source.damages ?? []).flatMap((d: Message) => {
    if (d.damage_type !== 6) return [structuredClone(d)];
    const target = b.fighters.find((f) => f.id === d.living_id);
    if (!target || target.hp <= 0) return [];
    const requested =
      b.encounter === 1 && actor.id === 3 && target.side === 2
        ? Math.max(Number(d.damage_value), target.hp)
        : Number(d.damage_value);
    return [applyDamage(b, actor, target, requested, d)];
  });
  if (source.awakenSoldiers?.length && !b.reinforcementsSpawned) {
    b.reinforcementsSpawned = true;
    m.awakenSoldiers = structuredClone(source.awakenSoldiers);
    b.prepare.soldiers ??= [];
    const stats = heroStats(
      b.prepare.heros.find((h: Message) => h.living_id === b.hero).temp_id,
      2,
    );
    for (const h of m.awakenSoldiers) {
      b.prepare.soldiers.push(structuredClone(h));
      b.fighters.push(fighter(h, stats, b.hero, b.job));
    }
  } else m.awakenSoldiers = [];
  return { opcode: 153, message: m, delayMs: 0 };
}
export function tutorialEngine(b: Battle): Engine {
  const models = [...(b.prepare.heros ?? []), ...(b.prepare.soldiers ?? [])];
  if (!b.engine) b.engine = createEngine([], b.hero);
  // Narrative NPC actions/invocations update the same actors between player slots.
  for (const f of b.fighters) {
    let current = b.engine.actors.find(a => a.id === f.id);
    if (!current) {
      current = makeActor({ ...models.find(h => h.living_id === f.id), living_id: f.id, side: f.side, hp: f.hp, max_hp: f.maxHp },
        { attack: f.attack, magicAttack: f.attack, defence: f.defence, magicDefence: f.defence }, f.skill);
      b.engine.actors.push(current);
    }
    current.hp = f.hp; current.maxHp = f.maxHp;
  }
  b.engine.battleId = b.id;
  const hero = b.engine.actors.find(a => a.id === b.hero)!;
  hero.learned = [...new Set([...hero.learned, ...b.skills])]; hero.equippedSkills = b.skills;
  hero.fury = b.sp; hero.cooldowns = { ...b.cooldowns }; hero.autoBattle = b.autoBattle ?? false;
  return b.engine;
}
function playerAction(b: Battle, now: number): BattleEvent {
  const engine = tutorialEngine(b), hero = engine.actors.find(a => a.id === b.hero)!;
  let skill = b.selected ?? engine.queue.find(c=>c.actor===b.hero)?.skill ?? b.job * 10000;
  if (b.selected === undefined && b.autoBattle && !engine.queue.some(c=>c.actor===b.hero)) {
    hero.lastAiDecision = evaluateBattleActions(engine, hero, now); skill = hero.lastAiDecision.skill;
    console.info("battle-ai", JSON.stringify({ battle: b.id, tutorial: b.encounter, actor: b.hero, ...hero.lastAiDecision }));
  }
  b.selected = undefined;
  engine.queue=engine.queue.filter(c=>c.actor!==b.hero);
  let template = skillTemplates.get(skill);
  if (
    !template ||
    b.sp + Number(template.Cost) < 0 ||
    (b.cooldowns[skill] ?? 0) > now
  ) {
    skill = b.job * 10000;
    template = skillTemplates.get(skill)!;
  }
  const actions = combatReference.encounters[b.encounter]!.actions;
  const mageSkill = skill === b.job * 10000 ? 30000 : 30000 + (skill % 10000);
  const sample = actions.find(
    (a) => a.living_id === b.hero && a.order_id === mageSkill,
  );
  const fallback = actions.find((a) => a.living_id === b.hero)!;
  const m = actionMessage(b, sample ?? fallback, now);
  const actor = b.fighters.find((f) => f.id === b.hero)!;
  const oldSp = b.sp;
  const passiveSp =
    b.encounter === 2 && b.job === 3
      ? (sample?.buffers ?? [])
          .flatMap((x: Message) => x.damage ?? [])
          .reduce(
            (n: number, d: Message) =>
              n + (d.damage_type === 9 ? Number(d.damage_value) : 0),
            0,
          )
      : 0;
  b.sp = Math.min(100, Math.max(0, b.sp + Number(template.Cost) + passiveSp));
  if (skill !== b.job * 10000)
    b.cooldowns[skill] = now + Number(template.CoolDown);
  const hits = Number(
    actionTemplates.get(Number(template.ActionId))?.AttackTimes ?? 1,
  );
  m.order_id = skill;
  m.living_id = b.hero;
  m.sp = b.sp;
  m.sp_added = Number(template.Cost);
  m.frame_num = Number(
    actionTemplates.get(Number(template.ActionId))?.FrameCount ??
      (hits >= 3 ? 79 : 39),
  );
  const coreHero = engine.actors.find(a => a.id === b.hero)!;
  coreHero.fury = oldSp;
  coreHero.cooldowns = { ...b.cooldowns };
  delete coreHero.cooldowns[skill]; // Already validated before reserving this scripted slot.
  const targets = targetsFor(b, skill).map(f => f.id);
  const resolution = execute(engine, { actor: b.hero, skill, targets, sequence: b.turn, automatic: false }, now, {
    suppressTriggers: true, scriptedTargets: targets, scriptedFury: b.sp, hits,
    minimumHp: (target, attacker) => hpFloor(b, b.fighters.find(f => f.id === target.id)!, b.fighters.find(f => f.id === attacker.id)!),
    scriptedDamage: (target, hit) => {
      const recorded = (sample?.damages ?? []).filter((d: Message) => d.living_id === target.id);
      if (b.job === 3 && recorded[hit]) return Number(recorded[hit].damage_value);
      const anyRecorded = (sample?.damages ?? []).filter((d: Message) => d.living_id === sample?.damages?.[0]?.living_id);
      const baseline = anyRecorded.length ? anyRecorded.reduce((n: number, d: Message) => n + Number(d.damage_value), 0)
        : b.encounter === 2 ? 80 : b.encounter === 1 ? 11 : 10;
      const mageTemplate = skillTemplates.get(mageSkill);
      const ratio = sample && mageTemplate ? Number(template.Parameter1) / Number(mageTemplate.Parameter1) : Number(template.Parameter1) / 100;
      return Math.max(1, Math.round((baseline * ratio) / hits));
    },
  });
  m.damages = resolution.damages;
  spendInitiative(engine,b.hero,now,Number(m.frame_num??resolution.frames)*40);
  for (const f of b.fighters) f.hp = engine.actors.find(a => a.id === f.id)!.hp;
  // Passive resource notifications must describe this action's current fúria.
  for (const buff of m.buffers ?? [])
    for (const d of buff.damage ?? [])
      if (d.damage_type === 9) d.left_value = b.sp;
  return { opcode: 153, message: m, delayMs: 0 };
}
// Each slot is an original NPC action or a player decision. A player slot accepts
// any available skill; no request cursor or recorded skill order is required.
// Offsets are recovered frames (25 fps), preserving the cinematic summon interval.
type Slot = { source?: number; player?: boolean; offset: number };
const PLANS: Slot[][][] = [
  [
    [
      { source: 0, offset: 61 },
      { source: 1, offset: 74 },
      { player: true, offset: 98 },
    ],
    [
      { source: 3, offset: 25 },
      { player: true, offset: 75 },
    ],
  ],
  [
    [
      { source: 0, offset: 61 },
      { player: true, offset: 98 },
    ],
    [
      { source: 2, offset: 34 },
      { player: true, offset: 74 },
    ],
    [{ source: 4, offset: 21 }],
    [
      { player: true, offset: 10 },
      { source: 6, offset: 19 },
    ],
    [{ source: 7, offset: 41 }],
    [{ player: true, offset: 75 }],
  ],
  [
    [
      { source: 0, offset: 61 },
      { player: true, offset: 98 },
    ],
    [
      { source: 2, offset: 25 },
      { source: 3, offset: 45 },
      { player: true, offset: 112 },
    ],
    [
      { source: 5, offset: 16 },
      { source: 6, offset: 45 },
      { player: true, offset: 115 },
    ],
  ],
];
export function advanceBattle(b: Battle, now: number): BattleEvent[] {
  if (!b.ready || b.paused || b.finished || now < b.nextTurnAt) return [];
  if (!openingReady(b, now, [b.hero], b.selected === undefined ? [] : [b.hero], b.turn + (b.actionIndex ?? 0))) {
    b.nextTurnAt = b.openingDeadline!; return [];
  }
  const events: BattleEvent[] = [];
  if (!b.started) {
    b.started = true;
    events.push({
      opcode: 156,
      message: {
        frame: b.frame,
        mainType: b.prepare.battle_type,
        count_down: 60000,
      },
      delayMs: 0,
    });
  }
  const plans = PLANS[b.encounter]!;
  const plan = plans[Math.min(b.turn, plans.length - 1)]!;
  const index = b.actionIndex ?? 0;
  const slot = plan[index]!;
  const engine=tutorialEngine(b);startInitiative(engine,now);advanceInitiative(engine,now);
  if(slot.player){
    if(!engine.queue.some(c=>c.actor===b.hero)){
      const hero=engine.actors.find(a=>a.id===b.hero)!;
      const skill=b.selected??(b.autoBattle?evaluateBattleActions(engine,hero,now).skill:b.job*10000);
      choose(engine,b.hero,skill,now,true);
    }
    const wait=initiativeWait(engine,b.hero,now);
    if(wait>0){b.nextTurnAt=now+wait;return events;}
  }
  const previousOffset = index > 0 ? plan[index - 1]!.offset : 0;
  b.frame += slot.offset - previousOffset;
  const action = slot.player
    ? playerAction(b, now)
    : npcAction(
        b,
        combatReference.encounters[b.encounter]!.actions[slot.source!]!,
        now,
      );
  if (action && slot.player && b.autoBattle) events.push({opcode:75,delayMs:0,message:{
    battle_id:b.id,hero_index_id:b.hero,skill_id:action.message.order_id,result:0,cast_time:0,qte_time:0,
    targetIndexs:(action.message.damages??[]).map((d:Message)=>d.living_id),
  }});
  if (action) events.push(action);
  b.actionIndex = index + 1;
  const liveEnemies = b.fighters.filter((f) => f.side === 2 && f.hp > 0);
  if (!liveEnemies.length) {
    b.finished = true;
    b.won = true;
    const reference = combatReference.encounters[b.encounter]!;
    const endGap = reference.finish.frame - reference.actions.at(-1)!.frame;
    events.push({
      opcode: 154,
      delayMs: endGap * 40,
      message: {
        frame: b.frame + endGap,
        prepareOverLivings: b.fighters
          .filter((f) => f.side === 1 && f.hp > 0)
          .map((f) => ({
            calc_type: 3,
            living_id: f.id,
            sp: f.id === b.hero ? b.sp : 0,
          })),
      },
    });
  } else if (b.actionIndex >= plan.length) {
    const span =
      b.turn === 0 ? 173 : b.encounter === 1 && b.turn === 3 ? 100 : 150;
    b.turn++;
    b.actionIndex = 0;
    // The summon is followed by a client pause/dialogue. Do not precompute the
    // player action: pause/continue and a new skill selection can arrive meanwhile.
    const gap = span - slot.offset;
    b.frame += gap;
    const next = plans[Math.min(b.turn, plans.length - 1)]![0]!;
    b.nextTurnAt = now + (gap + next.offset) * 40;
  } else {
    b.nextTurnAt = now + (plan[b.actionIndex]!.offset - slot.offset) * 40;
  }
  return events;
}
export function readyTutorialBattle(b: Battle, now: number): void {
  if(b.ready&&!b.paused)return;
  const e=tutorialEngine(b);
  if(e.initiative){
    if(!b.ready&&e.initiative.pausedAt===undefined)pauseInitiative(e,e.initiative.lastAt);
    resumeInitiative(e,now);
  }else startInitiative(e,now);
  b.ready = true; b.paused = false; b.nextTurnAt = now; beginOpening(b, now);
}
export function setTutorialPaused(b:Battle,paused:boolean,now:number):void {
  const e=tutorialEngine(b);
  if(paused){pauseInitiative(e,now);b.paused=true;return;}
  const shift=resumeInitiative(e,now);b.nextTurnAt+=shift;
  if(!b.openingComplete&&b.openingDeadline!==undefined)b.openingDeadline+=shift;
  b.paused=false;
}
