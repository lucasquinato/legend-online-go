import {configureMarriageCombat} from "../social/combat.js";
import { teams } from "../social/teams.js";
import type { Store } from "../../store.js";
import { randomBytes } from "node:crypto";
import { decodeMessage, typeName, type Message } from "../../messages.js";
import { fields } from "../../protocol.js";
import type { CityPacket } from "../../city-state.js";
import type { SkyHub, SkyMember } from "./hub.js";
import { SkyError } from "./errors.js";
import { createAdventure, advanceAdventure, readyAdventure, adventureSelection, type AdventureBattle, type AdventureReference } from "../battle/adventure.js";
import { createEngine, initializePassives, choose, actorBuffers, populateAutomatic } from "../battle/engine.js";
import { skills } from "../battle/content.js";
import { closingDelay } from "../battle/timing.js";
import { MessageCenter } from "../messaging/controller.js";

import { automaticModeMessage, setBattleAutomatic } from "../battle/automatic.js";

const INVITE_MS = 10000, LOAD_MS = 30000, DUEL_MS = 10 * 60000;
interface Invitation { attack: number; defence: number; expires: number; sides:number[][] }
interface Duel { ids: number[]; sides:number[][]; battle: AdventureBattle; ready: Set<number>; created: number; ended?: number; releaseAt?: number }

/** Consent and one authoritative battle for both sockets. No campaign saves/rewards. */
export class SkyDuels {
  private invitations = new Map<number, Invitation>();
  private battles = new Map<number, Duel>();
  private lastInvite = new Map<number, number>();
  constructor(private hub: SkyHub, private now = Date.now, private store?:Store) {}
  private cohort(uid:number):number[]{const ids=this.store?teams(this.store).members(uid):[];return ids.length?[uid,...ids.filter(id=>id!==uid)]:[uid];}
  private lock(ids:number[],locked:boolean){if(this.store)for(const id of ids)locked?teams(this.store).locked.add(id):teams(this.store).locked.delete(id);}
  battleId(uid: number): string | undefined { return this.battles.get(uid)?.battle.id; }
  busy(uid: number): boolean { const d = this.battles.get(uid); return !!d && (!d.ended || this.now() < d.releaseAt!); }
  private notice(uid: number, text: string): void { this.hub.send(uid, new MessageCenter(uid).notice(text)); }
  private inviteFor(uid: number): Invitation | undefined { return [...this.invitations.values()].find(i => i.sides.flat().includes(uid)); }
  private send(d: Duel, uid: number, packet: CityPacket): void { this.hub.send(uid, Object.assign({}, packet, { duelId: d.battle.id })); }
  private broadcast(d: Duel, packet: CityPacket): void { for (const uid of d.ids) this.send(d, uid, packet); }
  handle(uid: number, op: number, body: Buffer): CityPacket[] | undefined {
    if (op === 9547) { this.invite(uid, body); return []; }
    const duel = this.battles.get(uid);
    if (!duel || ![10007, 10008, 10499, 10010, 10022, 10020].includes(op)) return;
    const b = duel.battle, f = fields(body), value = (n: number) => f.find(v => v.number === n)?.value;
    const id = value(op === 10008 ? 1 : 2);
    if (!Buffer.isBuffer(id) || id.toString() !== b.id) return [];
    if (op === 10007) {
      if (!duel.ended) { duel.ready.add(uid); if (duel.ready.size === duel.ids.length && !b.ready) readyAdventure(b, this.now()); }
      return [];
    }
    // Pausing one client must never pause the opponent's simulation.
    if (op === 10010 || op === 10022) return [];
    const actor = b.engine!.actors.find(a => Number(b.fighters.find(h => h.living_id === a.id)?.user_id) === uid)!;
    if (op === 10020) {
      const request=decodeMessage(typeName("battle.AttackModeMsg"),body);
      if (duel.ended||b.finishing||![1,2].includes(Number(request.mode))||
          (request.userId!==undefined&&Number(request.userId)!==uid)) return [];
      if (setBattleAutomatic(b.engine!,actor.id,request.mode===1,this.now())) {
        populateAutomatic(b.engine!,this.now());
        this.broadcast(duel,{opcode:77,message:automaticModeMessage(b.engine!,actor.id,uid,b.id)});
      }
      return [];
    }
    if (op === 10499) {
      const request=decodeMessage(typeName("battle.BattleItemMsg"),body);
      const rune=actor.runes?.find(r=>r.skillId===Number(request.skillTempId));
      const selected=!duel.ended&&b.ready&&!b.finishing&&Number(request.userId)===actor.id&&!!rune&&choose(b.engine!,actor.id,rune.skillId,this.now());
      return [Object.assign({opcode:158,message:{uItemId:rune?.runeId??0,bagPos:rune?.slot??0,count:rune?Math.max(0,rune.maxUses-(actor.uses[rune.skillId]??0)):0,result:selected?0:1,living_id:actor.id,temp_id:rune?.skillId??Number(request.skillTempId??0),type:1}},{duelId:b.id}),
        ...(selected?[Object.assign({opcode:75,message:adventureSelection(b,actor.id,rune!.skillId,true,this.now())},{duelId:b.id})]:[])];
    }
    const skill = Number(value(3)), actorId = Number(value(2));
    const selected = !duel.ended && b.ready && !b.finishing && actorId === actor.id && choose(b.engine!, actor.id, skill, this.now());
    return [Object.assign({ opcode: 75, message: adventureSelection(b,actorId,skill,!!selected,this.now()) }, { duelId: b.id })];
  }
  private invite(uid: number, body: Buffer): void {
    const r = decodeMessage(typeName("campaign.HangupAttackMsg"), body), now = this.now(); this.expire(now);
    const attacker = Number(r.attack_id), defender = Number(r.defence_id), op = Number(r.op);
    if (!this.hub.members.has(uid)) throw new SkyError("Entre no Reino do Céu para duelar.");
    if (op === 1) {
      if (attacker !== uid || defender === uid || !this.hub.members.has(defender)) throw new SkyError("O adversário precisa estar conectado no Reino do Céu.");
      const sides=[this.cohort(uid),this.cohort(defender)],ids=sides.flat();
      if(new Set(ids).size!==ids.length)throw new SkyError("Não é possível duelar contra a própria equipe.");
      if(this.store&&sides.some(side=>side.length>1&&teams(this.store!).leader(teams(this.store!).id(side[0]!))!==(side.includes(uid)?uid:defender)))throw new SkyError("O convite de duelo deve ser enviado e recebido pelos líderes.");
      if(ids.some(id=>!this.hub.members.has(id)))throw new SkyError("Todos os membros das duas equipes precisam estar no Reino do Céu.");
      if (ids.some(id=>this.busy(id)||this.inviteFor(id))) throw new SkyError("Já existe um duelo ou convite em andamento.");
      if (now - (this.lastInvite.get(uid) ?? -Infinity) < 3000) throw new SkyError("Aguarde antes de enviar outro convite.");
      this.lastInvite.set(uid, now); this.invitations.set(uid, { attack: uid, defence: defender, expires: now + INVITE_MS, sides });
      this.hub.send(defender, { opcode: 4421, message: { attack_id: uid, attack_name: this.hub.members.get(uid)!.room().nick_name, defence_id: defender, op: 1 } });
      this.notice(uid, "Convite de duelo enviado."); return;
    }
    const invitation = this.invitations.get(attacker);
    if (![2, 3].includes(op) || defender !== uid || !invitation || invitation.defence !== uid || !this.hub.members.has(attacker)) throw new SkyError("O convite de duelo expirou ou não pertence a você.");
    this.invitations.delete(attacker);
    if (op === 3) { this.notice(attacker, "O convite de duelo foi recusado."); return; }
    const sides=invitation.sides,ids=sides.flat();
    if(JSON.stringify(sides)!==JSON.stringify([this.cohort(attacker),this.cohort(uid)])||ids.some(id=>this.busy(id)||!this.hub.members.has(id)))throw new SkyError("A composição ou disponibilidade das equipes mudou. Envie outro convite.");
    const battle=createDuel(sides.map(side=>side.map(id=>this.hub.members.get(id)!)),id=>this.store?teams(this.store).position(id):6,this.store);
    this.lock(ids,true);
    const duel: Duel = { ids, sides, battle, ready: new Set(), created: now };
    for (const id of ids) this.battles.set(id, duel);
    for (const id of ids) {
      const hero = battle.prepare.heros.find((h: Message) => h.user_id === id)!;
      const prepare = structuredClone(battle.prepare); prepare.side = hero.side;
      prepare.attack_model = battle.engine!.actors.find(a=>a.id===hero.living_id)?.autoBattle ? 1 : 2;
      prepare.coolDown = hero.skillId.filter((s: number) => Number(skills.get(s)?.UseWay) === 1)
        .map((templated_id: number) => { const rune=battle.engine!.actors.find(a=>a.id===hero.living_id)!.runes?.find(r=>r.skillId===templated_id);return { templated_id, cool_down: rune?.openingCooldownMs??0, cool_type: 1, appear_cool_down: rune?.openingCooldownMs??0 }; });
      this.send(duel, id, { opcode: 157, message: prepare });
    }
  }
  private expire(now: number): void {
    for (const [id, i] of this.invitations) if (now >= i.expires) {
      this.invitations.delete(id); this.notice(i.attack, "O convite de duelo expirou.");
    }
  }
  tick(now = this.now()): void {
    this.expire(now);
    for (const d of new Set(this.battles.values())) {
      if (d.ended) { if(now >= d.releaseAt!)this.lock(d.ids,false); if (now - d.ended > 60000) for (const id of d.ids) if (this.battles.get(id) === d) this.battles.delete(id); continue; }
      if ((!d.battle.ready && now - d.created > LOAD_MS) || now - d.created > DUEL_MS) {
        for (const uid of d.ids) this.notice(uid, d.battle.ready ? "Duelo encerrado pelo limite de tempo." : "Duelo cancelado: o adversário não terminou de carregar.");
        this.finish(d, undefined, now); continue;
      }
      const events = advanceAdventure(d.battle, {} as AdventureReference, now);
      // A duel ends on either player's defeat; surviving troops do not prolong it.
      if (d.battle.victory!=="all-heroes" && !d.battle.finishing && d.battle.engine!.actors.find(a => a.id === 6)!.hp <= 0) {
        d.battle.finishing = true; d.battle.won = true;
      }
      for (const p of events) this.broadcast(d, p);
      if (d.battle.finished) this.finish(d, d.battle.won ? d.sides[0]![0] : d.sides[1]![0], now, false);
    }
  }
  private finish(d: Duel, winner: number | undefined, now: number, prepareOver = true): void {
    if (d.ended) return;
    d.ended = now; d.battle.finished = true;
    const delay = closingDelay(Math.max(0, d.battle.nextAt - now)); d.releaseAt = now + delay;
    if (prepareOver) this.broadcast(d, { opcode: 154, message: { frame: d.battle.frame, prepareOverLivings: [] } });
    for (const uid of d.ids) this.send(d, uid, { opcode: 4103, delayMs: delay, message: {
      battle_result: winner === undefined ? 0 : d.sides.find(side=>side.includes(winner))!.includes(uid) ? 1 : 2,
      gp_bonus: 0, pet_gp_bonus: 0, gold_bonus: 0, strategy_bonus: 0, baseItem: [],
    } });
  }
  leave(uid: number): void {
    const invitation = this.inviteFor(uid);
    if (invitation) { this.invitations.delete(invitation.attack); this.notice(invitation.attack === uid ? invitation.defence : invitation.attack, "O jogador saiu; convite de duelo cancelado."); }
    const d = this.battles.get(uid);
    if(d&&!d.ended&&d.battle.victory==="all-heroes"){
      const f=d.battle.fighters.find(f=>Number(f.user_id)===uid),actor=d.battle.engine!.actors.find(a=>a.id===f?.living_id);
      if(f)f.hp=0;if(actor)actor.hp=0;d.ready.add(uid);
      const side=d.sides.find(s=>s.includes(uid))!;
      if(!d.battle.engine!.actors.some(a=>a.side===Number(f?.side)&&a.hp>0))this.finish(d,d.sides.find(s=>s!==side)?.[0],this.now());
      else if(d.ready.size===d.ids.length&&!d.battle.ready)readyAdventure(d.battle,this.now());
    }else if (d && !d.ended)this.finish(d,d.sides.find(side=>!side.includes(uid))?.[0],this.now());
    if(this.store)teams(this.store).locked.delete(uid);
    this.battles.delete(uid); this.lastInvite.delete(uid);
  }
}

function createDuel(sides: SkyMember[][],position:(uid:number)=>number,store?:Store): AdventureBattle {
  const members=sides.flat(),collective=members.length>2;
  const parts = members.map((m, index) => {
    const side=sides[0]!.includes(m)?1:2;
    const { state, modifiers, initialFury } = m.combat(), room = m.room();
    if(collective)state.army.armyPawn=[];
    state.player.player_id = m.uid; state.hero.tempate_id = room.template_id; state.hero.nick_name = room.nick_name;
    const ref: AdventureReference = { prepare: { battle_type: collective?11:14, map_temp_id: 10000, side: 1, need_animation: false, has_assault: false,
      use_way: 0, battle_from: 0, battle_capity: 1, reinforceCount: 0, currentReinforce: 0,
      heros: [{ type: 1, side: 1, living_id: 3, qte_time: 0, cast_time: 4500, spMax: 100, hitPointMax: 5 }],
      soldiers: [1, 2].map((living_id, i) => ({ type: 1, side: 1, living_id, pos: 1 + 9 * i, qte_time: 0, cast_time: 4500 })),
    }, actions: [], finish: {}, rewards: [] };
    const part = createAdventure(ref, -1, state, initialFury, modifiers);
    for (const f of part.fighters) { f.living_id += index * 3; f.side = side; if(collective)f.pos=position(m.uid); f.buffers = []; }
    return { part, modifiers };
  });
  const b = parts[0]!.part, fighters = parts.flatMap(p => p.part.fighters);
  const actors = parts.flatMap(({ part, modifiers }, index) => part.fighters.map(f => {
    const isHero = f.user_id !== undefined;
    // Actor is the internal snapshot; fighters are protocol models only.
    const actor = structuredClone(part.engine!.actors.find(a=>a.id===Number(f.living_id)-index*3)!);
    actor.id=Number(f.living_id);actor.side=Number(f.side);actor.pos=Number(f.pos);
    if (isHero) actor.permanentModifiers = structuredClone(modifiers);
    return actor;
  }));
  b.fighters = fighters; b.hero = 3; if(collective)b.victory="all-heroes";
  b.prepare.heros = fighters.filter(f => f.user_id !== undefined).map(f => structuredClone(f));
  b.prepare.soldiers = fighters.filter(f => f.user_id === undefined).map(({ max_hp, buffers, sp, ...f }) => structuredClone(f));
  b.prepare.soldierTemplated = [...new Set(b.prepare.soldiers.map((f: Message) => Number(f.temp_id)))];
  b.engine = createEngine(actors, 3, randomBytes(4).readUInt32LE(), fighters.filter(f=>f.user_id!==undefined).map(f=>Number(f.living_id))); if(store)configureMarriageCombat(store,b.engine,fighters.filter(f=>f.user_id!==undefined).map(f=>({actor:Number(f.living_id),uid:Number(f.user_id)})));initializePassives(b.engine);
  for (const f of fighters) f.buffers = actorBuffers(b.engine, f.living_id);
  for (const h of b.prepare.heros) {
    h.buffers = actorBuffers(b.engine, h.living_id);h.skillId=[...b.engine.actors.find(a=>a.id===h.living_id)!.learned];
    const actor=b.engine.actors.find(a=>a.id===h.living_id)!;
    h.item=(actor.runes??[]).map(r=>({userId:actor.id,battleId:b.id,uItemId:r.runeId,tempId:r.runeId,bagPos:r.slot,skillTempId:r.skillId,count:r.maxUses,sonType:91}));
  }
  return b;
}
