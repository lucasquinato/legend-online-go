import {teams} from "../social/teams.js";
import type { Store } from "../../store.js";
import type { CitySave } from "../../city-world.js";
import { decodeMessage, typeName, type Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import { skyMap, inBounds, walkable, clearSegment, onSegment, nearestGround, type Point } from "./map.js";
import { skyHub, type SkyMember } from "./hub.js";
import { inspectPlayer } from "../social/inspection.js";
import { AttributeCalculator } from "../../attributes.js";
import { SkyError } from "./errors.js";
export { SkyError } from "./errors.js";
export { skyWire } from "./protocol.js";
export interface SkySave { active: boolean; position: Point; returnPosition: Point; route?: Point[] }
interface Context { store: Store; uid: number; saved: CitySave; persist(): void; atomic<T>(action: () => T): T; andrew?(node:number):CityPacket[] }
export class SkyRealm {
  constructor(private c: Context) {}
  get active(): boolean { return this.c.saved.map === skyMap.mapId && !!this.c.saved.skyRealm?.active; }
  get duelBattleId(): string | undefined { return this.hub.duels.battleId(this.c.uid); }
  get flying(): boolean { return this.c.saved.mounts?.mounted === true && this.c.saved.mounts.mobility.mode === "air-capable"; }
  private get data() { return this.c.saved.skyRealm!; }
  private get state() { return this.c.saved.state; }
  private get hub() { return skyHub(this.c.store); }
  private member(): SkyMember { return { uid: this.c.uid, room: () => this.room(), inspect: () => inspectPlayer(this.c.store, this.c.uid, this.c.saved)!,
    combat: () => ({ state: structuredClone(this.state), modifiers: AttributeCalculator.combat(this.c.saved.attributes!),
      initialFury: Number(AttributeCalculator.calculate(this.c.saved.attributes!).total_initial_fury ?? 0) }) }; }
  room(): Message {
    const { uid, store } = this.c, { army, hero, player } = this.state, profile = store.tutorialProfile(uid)!;
    return {
      player_id: uid, hero_id: uid, army_id: uid, nick_name: profile.nickname, template_id: profile.icon, head_id: profile.icon,
      sex: profile.sex, grades: player.grades, fighting_capacity: hero.fighting_capacity, campaign_id: skyMap.mapId,
      cur_pos_x: this.data.position.x, cur_pos_y: this.data.position.y, online_state: 1, army_state: this.hub.duels.busy(uid) ? 2 : 0,
      arm: army.arm ?? "", cloth: army.cloth ?? "", wing: army.wing ?? "", hat: army.hat ?? "",
      fashion_arm: army.fashion_arm ?? "", fashion_cloth: army.fashion_cloth ?? "", hide: army.hide ?? 0,
      appellid: player.appell_id ?? 0, mount_tempId: army.mount_tempId ?? 0, mount_grade: army.mount_grade ?? 0,
      consortia_id: 0, consortia_name: "", is_vip: 0, vip_type: 0, change_shapeId: 0, fate_skills: "",
      transfer_grade: 0, petTemplateId: 0, pet_quqlity: 0, pet_name: "", dragon_grade: "",
    };
  }
  private applyPosition(): void {
    Object.assign(this.state.army, { map_id: skyMap.mapId, cur_pos_x: this.data.position.x, cur_pos_y: this.data.position.y });
  }
  private correction(): CityPacket { return { opcode: 4126, message: { id: this.c.uid, pos_x: this.data.position.x, pos_y: this.data.position.y } }; }
  enter(map = skyMap.mapId): CityPacket[] {
    if (this.hub.duels.busy(this.c.uid)) throw new SkyError("Conclua o duelo antes de recarregar o Reino do Céu.");
    if (map !== skyMap.mapId) throw new SkyError("Este acesso permite apenas o Reino do Céu.");
    if (this.c.saved.battle && !this.c.saved.battle.finished) throw new SkyError("Encerre a batalha antes de entrar no Reino do Céu.");
    if (!this.active && this.c.saved.map !== 1) throw new SkyError("Saia da instância antes de entrar no Reino do Céu.");
    this.c.atomic(() => {
      if (!this.active) {
        const previous = this.c.saved.skyRealm;
        this.c.saved.skyRealm = { active: true, position: previous?.position ?? nearestGround(skyMap.spawn),
          returnPosition: { x: Number(this.state.army.cur_pos_x), y: Number(this.state.army.cur_pos_y) } };
      }
      if (!inBounds(this.data.position) || (!this.flying && !walkable(this.data.position))) this.data.position = nearestGround(this.data.position);
      delete this.data.route;
      this.c.saved.map = skyMap.mapId; delete this.c.saved.location; delete this.c.saved.instanceFury;
      this.applyPosition(); this.c.persist();
    });
    this.hub.join(this.member());
    return [{ opcode: 4595, message: { player: [this.room()] } }, { opcode: 4606, message: { player: [this.room()] }, delayMs: 5 },
      { opcode: 4597, message: { player: [...this.hub.members.values()].filter(m => m.uid !== this.c.uid).map(m => m.room()) }, delayMs: 20 }];
  }
  leave(): void {
    if (!this.active) return;
    if (this.hub.duels.busy(this.c.uid)) throw new SkyError("Conclua o duelo antes de sair do Reino do Céu.");
    this.c.atomic(() => {
      this.data.active = false; delete this.data.route; this.c.saved.map = 1; delete this.c.saved.location;
      Object.assign(this.state.army, { map_id: 1, cur_pos_x: this.data.returnPosition.x, cur_pos_y: this.data.returnPosition.y });
      this.c.persist();
    });
    this.hub.leave(this.c.uid);
  }
  disconnect(): void { this.hub.leave(this.c.uid); }
  tick(): CityPacket[] {
    if (!this.active) { this.disconnect(); return []; }
    const packets: CityPacket[] = [];
    // Never leave a character standing on water after a flying mount expires or is removed.
    if (!this.flying && !walkable(this.data.position)) {
      this.c.atomic(() => { this.data.position = nearestGround(this.data.position); delete this.data.route; this.applyPosition(); this.c.persist(); });
      packets.push(this.correction()); this.hub.broadcast(this.c.uid, { opcode: 4597, message: { player: [this.room()] } });
    }
    this.hub.duels.tick();
    this.hub.refresh(this.c.uid); return [...packets, ...this.hub.drain(this.c.uid)];
  }
  handle(op: number, body: Buffer): CityPacket[] | undefined {
    if ([8200, 15038, 8199].includes(op)) {
      const request = decodeMessage(typeName(op === 8199 ? "simple.DetailReqMsg" : "simple.InfoReqMsg"), body);
      const uid = Number(request.other_id);
      if (!Number.isSafeInteger(uid) || uid <= 0 || uid > 2147483647) throw new SkyError("Personagem local inválido.");
      const info = this.hub.members.get(uid)?.inspect() ?? inspectPlayer(this.c.store, uid, uid === this.c.uid ? this.c.saved : undefined);
      if (op !== 8199) {
        const player = info?.player ?? { userId: uid, isExist: 0 }, from = Number(request.from ?? 0);
        return op === 8200 ? [{ opcode: 4128, message: { info: player, from } }]
          : [{ opcode: 4256, message: { player, from, group_id:2, sns_info:{user_id:uid,nickname:player.nickName??"",head_id:player.pics??0,sex:player.sexs??0}, relation: this.c.store.db.prepare("SELECT 1 FROM local_friends WHERE owner_id=? AND friend_id=?").get(this.c.uid, uid) ? 1 : 0 } }];
      }
      if (!info) throw new SkyError("Personagem local inexistente.");
      return [{ opcode: 4125, message: { ...info.detail, other_id: uid, army: info.army, item: request.item_info ? info.items : [], hide_fashion: info.hide } }];
    }
    const duelResponse = this.hub.duels.handle(this.c.uid, op, body);
    if (duelResponse) return duelResponse;
    if (op === 8688) return this.enter(Number(decodeMessage(typeName("simple.PropertyMsg"), body).param1 ?? skyMap.mapId));
    if ([8689, 8747].includes(op)) return undefined; // CityWorld supplies the native castle return sequence.
    if (![8690, 8692, 8700, 8701, 9547].includes(op)) return;
    if (!this.active) {
      throw new SkyError("Entre no Reino do Céu primeiro.");
    }
    // Portals and NPC activities remain inert.
    if(op===8692){const node=Number(decodeMessage(typeName("simple.PropertyMsg"),body).param1);return this.c.andrew?.(node)??[]; }
    if (this.hub.duels.busy(this.c.uid) && [8690, 8700].includes(op)) return [];
    if (op === 8700) {
      this.c.atomic(() => { this.data.position = nearestGround(skyMap.spawn); delete this.data.route; this.applyPosition(); this.c.persist(); });
      this.hub.broadcast(this.c.uid, { opcode: 4597, message: { player: [this.room()] } });
      return [this.correction()];
    }
    if (op === 8690) {
      const request = decodeMessage(typeName("campaign.SpacePlayerMoveMsg"), body), players = request.players ?? [];
      if (players.length !== 1 || Number(players[0].playerId) !== this.c.uid) throw new SkyError("Movimento de personagem inválido.");
      const path: Point[] = players[0].path ?? [];
      if (!path.length || path.length > 2048 || body.length > 32768) throw new SkyError("Trajeto inválido.");
      // The client animates a whole route locally and may replace it halfway through.
      // Its new start may therefore be on the previous accepted route, before our saved endpoint.
      const first = path[0]!;
      if (!clearSegment(this.data.position, first, this.flying) &&
          !this.data.route?.some((p, i, route) => onSegment(first, i ? route[i - 1]! : p, p))) return [this.correction()];
      let from = first;
      for (const p of path) { if (!clearSegment(from, p, this.flying)) return [this.correction()]; from = p; }
      const position = { x: from.x, y: from.y };
      const route = path.map(p => ({ x: p.x, y: p.y }));
      this.c.atomic(() => { this.data.position = position; this.data.route = route; this.applyPosition(); this.c.persist(); });
      const movement = { opcode: 4594, message: { players: [{ playerId: this.c.uid, state: 0, path: path.map(p => ({ x: p.x, y: p.y })) }] } };
      this.hub.broadcast(this.c.uid, movement);teams(this.c.store).sync(this.c.uid);
      // SpaceWalkLayer concatenates incoming paths with the route already animating.
      // Echoing this to its author replays the old route, walking back and forth.
      return [];
    }
    if (op === 8701) {
      const request = decodeMessage(typeName("campaign.SpacePlayerArmyInfoReqMsg"), body), ids: number[] = request.userList ?? [];
      if (ids.length > 100 || ids.some(id => !Number.isSafeInteger(id))) throw new SkyError("Consulta de jogadores inválida.");
      return [{ opcode: 4597, message: { player: [...new Set(ids)].flatMap(id => this.hub.members.get(id)?.room() ? [this.hub.members.get(id)!.room()] : []) } }];
    }
    return [];
  }
}
