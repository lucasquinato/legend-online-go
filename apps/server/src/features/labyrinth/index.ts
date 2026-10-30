import { gameDay } from "../../game-clock.js";
import { randomUUID, randomInt } from "node:crypto";
import { itemTemplate } from "../../inventory.js";
import type { CitySave, CityScenario } from "../../city-world.js";
import type { CityPacket } from "../../city-state.js";
import type { Message } from "../../messages.js";
import type { LabyrinthBotSave } from "./bot.js";
import {
  labyrinthFloors,
  labyrinthLimit,
  isLabyrinthMap,
  type LabyrinthMode,
  type LabyrinthDrop,
} from "./content.js";
export * from "./content.js";

export class LabyrinthError extends Error {}
export interface LabyrinthProgress {
  floor: number;
  cleared: number[];
  entered: boolean;
  claimed?: number[];
  completed?: boolean;
  runId?: string;
  totalGp?: number;
  multiplier?: 1 | 2;
  items?: Record<string, number>;
  record?: number;
  lastEntryDay?: string;
  chestLoot?: Record<string, LabyrinthDrop[]>;
}
export interface LabyrinthSave extends LabyrinthProgress {
  version: 1;
  mode?: LabyrinthMode;
  abyss?: LabyrinthProgress;
  bot?: LabyrinthBotSave;
}
/** Victory unlocks the portal; walking into it is a separate, persisted mutation. */
export class LabyrinthFeature {
  readonly secondBattle: number;
  private readonly battles = new Map<number, number>();
  private loadedMap?: number;
  get sceneMap(): number | undefined {
    return this.loadedMap;
  }
  restoreScene(map: number | undefined): void {
    this.loadedMap = map;
  }
  constructor(
    private saved: CitySave,
    private scenario: CityScenario,
    private now: () => number = Date.now,
    private pick: (size: number) => number = randomInt,
  ) {
    // Preserve campaign IDs and the previously deployed IDs for floors 1 and 2.
    this.secondBattle = scenario.battles.length;
    for (const floor of labyrinthFloors.values()) {
      const index = floor.map === 8001 ? 2 : scenario.battles.length;
      if (index === 2) scenario.battles[2] = structuredClone(floor.reference);
      else scenario.battles.push(structuredClone(floor.reference));
      this.battles.set(floor.map, index);
    }
  }
  battleIndex(): number {
    return this.battles.get(this.map)!;
  }
  isBattle(index: number): boolean {
    return [...this.battles.values()].includes(index);
  }
  get data(): LabyrinthSave {
    const old = this.saved.state.tower;
    const data = (this.saved.labyrinth ??= {
      version: 1,
      floor: this.saved.map === 8002 || Number(old.tower_index) === 2 ? 2 : 1,
      cleared: this.saved.won.includes(2) ? [1] : [],
      entered: Number(old.enter_count) > 0 || this.saved.won.includes(2),
    });
    // Migration only: during a new victory won[] is written before victory().
    // Inferring a clear on every read would skip the first floor's XP counter.
    if (!data.runId && this.saved.won.includes(2) && !data.cleared.includes(1))
      data.cleared.push(1);
    data.mode ??=
      this.saved.map >= 8101 && this.saved.map <= 8130 ? 8101 : 8001;
    data.runId ??= randomUUID();
    data.totalGp ??= Number(old.total_gp ?? 0);
    data.multiplier ??= 2; // Existing captured entry used the double-reward key.
    data.claimed ??= [];
    data.items ??= {};
    data.abyss ??= {
      floor: 1,
      cleared: [],
      entered: false,
      runId: randomUUID(),
      totalGp: 0,
      multiplier: 1,
      claimed: [],
      items: {},
    };
    for (const progress of [data, data.abyss]) {
      progress.record = Math.max(progress.record ?? 0, ...progress.cleared, progress.floor - 1);
      if (progress.entered) progress.lastEntryDay ??= this.day();
    }
    return data;
  }
  day(): string {
    return gameDay(this.now());
  }
  get mode(): LabyrinthMode {
    return this.data.mode!;
  }
  progress(mode: LabyrinthMode = this.mode): LabyrinthProgress {
    return mode === 8001 ? this.data : this.data.abyss!;
  }
  get map(): number {
    return this.mode + this.progress().floor - 1;
  }
  get active(): boolean {
    return isLabyrinthMap(this.saved.map);
  }
  get floorCleared(): boolean {
    return this.progress().cleared.includes(this.progress().floor);
  }
  get finalFloor(): boolean {
    return this.progress().floor === labyrinthLimit(this.mode);
  }
  synchronize(): void {
    const t = this.saved.state.tower;
    Object.assign(t, this.tower(8001));
  }
  tower(mode: LabyrinthMode = this.mode): Message {
    const d = this.progress(mode);
    return {
      enter_count: d.lastEntryDay === this.day() ? 1 : 0,
      total_gp: d.totalGp ?? 0,
      tower_index: d.entered && !d.completed ? d.floor : 0,
      max_index: Math.min(labyrinthLimit(mode), d.record ?? 0),
      order: 0,
      max_enterCount: 1,
      item_tempIds: Object.entries(d.items ?? {})
        .map(([id, count]) => `${id},${count}`)
        .join("|"),
      free_enterCount: mode === 8001 ? 1 : 0,
      campaign_id: mode,
      index: mode === 8001 ? 0 : 1,
    };
  }
  list(): CityPacket {
    return {
      opcode: 4373,
      message: { towerInfo: [this.tower(8001), this.tower(8101)] },
    };
  }
  private nodes(): Message[] {
    const d = this.progress();
    return structuredClone(labyrinthFloors.get(this.map)!.nodes).map(
      (node: Message) => {
        if (node.master_type === 42) node.state = this.floorCleared ? 8 : 1;
        if (node.son_type === 2336) node.state = this.floorCleared ? 1 : 16;
        if (node.master_type === 61)
          node.state = d.claimed?.includes(d.floor) ? 8 : 1;
        return node;
      },
    );
  }
  entryPackets(kind = 1): CityPacket[] {
    return [
      { opcode: 4165, message: { army_id: this.scenario.userId } },
      {
        opcode: 125,
        message: { created_type: kind, room: { campaignId: this.map } },
      },
    ];
  }
  loadPackets(): CityPacket[] {
    const floor = labyrinthFloors.get(this.map)!;
    const room = structuredClone(floor.room);
    for (const player of room.player ?? [])
      Object.assign(player, {
        campaign_id: this.map,
        cur_pos_x: this.saved.state.army.cur_pos_x,
        cur_pos_y: this.saved.state.army.cur_pos_y,
        army_state: 0,
      });
    return [
      { opcode: 127, message: { node: this.nodes() } },
      { opcode: 130, message: structuredClone(floor.fog) },
      { opcode: 21, message: room },
      { opcode: 4205, message: this.tower() },
      {
        opcode: 131,
        message: {
          army_id: this.scenario.userId,
          player_id: this.scenario.userId,
          cur_pos_x: this.saved.state.army.cur_pos_x,
          cur_pos_y: this.saved.state.army.cur_pos_y,
          state: 0,
        },
      },
    ];
  }
  private saveLocation(kind = 1): void {
    this.saved.location = [...this.entryPackets(kind), ...this.loadPackets()];
  }
  private scenePackets(): CityPacket[] {
    // CampaignManager (core module) handles 125/127/21 synchronously. Deliver
    // the snapshot in the same burst, before the cached scene creates its walk
    // layer and initSelfArmy(). The recorded network latency is not a protocol
    // requirement; delaying RoomEnter leaves the player's control view unset.
    this.loadedMap = this.map;
    return [
      ...this.entryPackets().map((p) => ({ ...p, delayMs: 0 })),
      ...this.loadPackets().map((p) => ({ ...p, delayMs: 0 })),
    ];
  }
  private enemyResources(): CityPacket {
    const prepare = this.scenario.battles[this.battleIndex()]!.prepare;
    return {
      opcode: 20,
      message: {
        soldierTemplated: [
          ...new Set(
            (prepare.soldiers ?? [])
              .filter((p: Message) => p.side === 2)
              .map((p: Message) => p.temp_id),
          ),
        ],
        heroTemplated: [
          ...new Set(
            (prepare.heros ?? [])
              .filter((p: Message) => p.side === 2)
              .map((p: Message) => p.temp_id),
          ),
        ],
      },
    };
  }
  private livePackets(): CityPacket[] {
    if (this.loadedMap !== this.map) {
      this.loadedMap = this.map;
      return this.loadPackets();
    }
    return [
      ...this.nodes()
        .sort((a, b) => Number(b.master_type === 42) - Number(a.master_type === 42))
        .map((node) => this.nodeUpdate(node)),
      {
        opcode: 131,
        message: {
          army_id: this.scenario.userId,
          player_id: this.scenario.userId,
          cur_pos_x: this.saved.state.army.cur_pos_x,
          cur_pos_y: this.saved.state.army.cur_pos_y,
          state: 0,
        },
      },
      { opcode: 4205, message: this.tower() },
    ];
  }
  assertAccess(mode: LabyrinthMode = this.mode): void {
    if (mode !== 8101) return;
    if (Number(this.saved.state.player.grades) < 80)
      throw new LabyrinthError("O Abismo é liberado somente no nível 80.");
    if ((this.progress(8001).record ?? 0) < 100)
      throw new LabyrinthError("Conclua os 100 pisos do Labirinto antes de acessar o Abismo.");
  }
  selectMode(mode: LabyrinthMode): void {
    this.assertAccess(mode);
    if (this.saved.battle && !this.saved.battle.finished)
      throw new LabyrinthError(
        "Termine a batalha antes de trocar de labirinto.",
      );
    this.data.mode = mode;
  }
  renewDailyRun(mode: LabyrinthMode = this.mode): boolean {
    this.assertAccess(mode);
    const progress = this.progress(mode);
    if (progress.entered && progress.completed && progress.lastEntryDay !== this.day() && this.saved.map === 1) {
      this.reset(mode);
      return true;
    }
    return false;
  }
  begin(multiplier: 1 | 2): void {
    this.assertAccess();
    const d = this.progress();
    if (d.completed)
      throw new LabyrinthError(
        "A rodada de hoje já foi concluída. Uma nova rodada fica disponível no próximo dia.",
      );
    if (!d.entered) {
      if (d.lastEntryDay === this.day())
        throw new LabyrinthError("Você já iniciou a rodada de hoje. Uma nova rodada fica disponível no próximo dia.");
      d.multiplier = multiplier;
      d.lastEntryDay = this.day();
    }
  }
  reset(mode: LabyrinthMode): CityPacket[] {
    if (this.saved.map !== 1 || (this.saved.battle && !this.saved.battle.finished) || (this.data.bot && !this.data.bot.ended))
      throw new LabyrinthError("Saia do labirinto e encerre a batalha ou o bot antes de redefinir.");
    const progress = this.progress(mode);
    Object.assign(progress, {
      floor: 1, cleared: [], entered: false, claimed: [], completed: false,
      runId: randomUUID(), totalGp: 0, multiplier: 1, items: {}, chestLoot: {},
    });
    const references = new Set([...labyrinthFloors.values()].filter(f => f.mode === mode).map(f => this.battles.get(f.map)!));
    this.saved.won = this.saved.won.filter(index => !references.has(index));
    if (this.saved.battle && references.has(this.saved.battle.reference)) delete this.saved.battle;
    if (this.data.bot?.mode === mode) delete this.data.bot;
    this.synchronize();
    return [{ opcode: 4205, message: this.tower(mode) }, this.list()];
  }
  enter(): CityPacket[] {
    this.assertAccess();
    const continuing =
      this.saved.map === this.map && this.loadedMap === this.map;
    this.progress().entered = true;
    this.saved.map = this.map;
    if (!continuing) {
      const start = labyrinthFloors.get(this.map)!.start;
      Object.assign(this.saved.state.army, {
        cur_pos_x: start.x,
        cur_pos_y: start.y,
        state: 0,
      });
    }
    this.synchronize();
    this.saveLocation();
    return continuing ? this.livePackets() : this.scenePackets();
  }
  reconnect(): CityPacket[] {
    this.loadedMap = undefined;
    this.saved.map = this.map;
    this.synchronize();
    this.saveLocation();
    return this.scenePackets();
  }
  load(): CityPacket[] {
    this.saved.map = this.map;
    this.synchronize();
    this.saveLocation();
    // 5038 is emitted by enterOver(), including when the map assets are cached.
    // It can precede the queued 127/21 snapshot. Sending 131 here creates a
    // system army before RoomEnter registers the player; 128 then targets nodes
    // that do not exist yet. The original response only preloads battle assets.
    return [this.enemyResources()];
  }
  private nodeUpdate(node: Message): CityPacket {
    return {
      opcode: 128,
      message: {
        node_id: node.node_id,
        node_state: node.state,
        uu_id: `${this.progress().runId}:${node.node_id}`,
        param1: node.param1,
        sonType: node.son_type,
        $12: { wire: 0, value: "0" },
      },
    };
  }
  battleStarted(): CityPacket {
    const node = this.nodes().find((n) => n.master_type === 42)!;
    return this.nodeUpdate({ ...node, state: 4 });
  }
  refresh(): CityPacket[] {
    return this.livePackets();
  }
  experience(): number {
    const report = labyrinthFloors
      .get(this.map)!
      .reference.rewards.find((p) => p.opcode === 4103)!.message!;
    return (Number(report.gp_bonus) * (this.progress().multiplier ?? 2)) / 2;
  }
  victory(): CityPacket[] {
    const d = this.progress();
    if (!this.floorCleared) {
      d.cleared.push(d.floor);
      d.record = Math.max(d.record ?? 0, d.floor);
      d.totalGp = (d.totalGp ?? 0) + this.experience();
    }
    d.entered = true;
    this.synchronize();
    if (this.active) this.saveLocation();
    const nodes = this.nodes();
    return [
      this.list(),
      // Disable collision with the defeated enemy before reactivating the army.
      this.nodeUpdate(nodes.find((n) => n.master_type === 42)!),
      this.nodeUpdate(nodes.find((n) => n.son_type === 2336)!),
      {
        opcode: 131,
        message: {
          army_id: this.scenario.userId,
          player_id: this.scenario.userId,
          cur_pos_x: this.saved.state.army.cur_pos_x,
          cur_pos_y: this.saved.state.army.cur_pos_y,
          state: 0,
        },
      },
    ];
  }
  defeat(): CityPacket[] {
    return this.livePackets();
  }
  chestDrops(node: number): LabyrinthDrop[] {
    const floor = labyrinthFloors.get(this.map)!;
    if (!floor.nodes.some((n) => n.node_id === node && n.master_type === 61))
      throw new LabyrinthError("Baú inexistente neste piso.");
    if (!this.floorCleared)
      throw new LabyrinthError("Derrote o monstro antes de coletar o baú.");
    if (this.progress().claimed?.includes(this.progress().floor))
      throw new LabyrinthError("Baú já coletado.");
    const progress = this.progress();
    const loot = (progress.chestLoot ??= {});
    if (!loot[progress.floor]) loot[progress.floor] = floor.drops.map(drop => {
      const template = itemTemplate(drop.templateId);
      const level = Number(template?.Property6);
      if (template?.SonType === "205" && template.MasterType === "2") {
        const candidates = Array.from({ length: 8 }, (_, index) => 2050000 + (index + 1) * 100 + level)
          .filter(id => Number(itemTemplate(id)?.Property6) === level);
        if (candidates.length !== 8) throw new LabyrinthError("Tabela de gemas incompleta para este piso.");
        const templateId = candidates[this.pick(candidates.length)]!;
        const count = 2 * (progress.multiplier ?? 2);
        return { templateId, count, model: { ...structuredClone(drop.model!), template_id: templateId, count } };
      }
      return { ...structuredClone(drop), count: (drop.count * (progress.multiplier ?? 2)) / 2 };
    });
    return structuredClone(loot[progress.floor]!);
  }
  completion(): CityPacket {
    const d = this.progress();
    return { opcode: 4425, message: {
      status: 10, sweep_type: 3, campaign_id: this.mode, total_gp: d.totalGp ?? 0,
      result: [{ type: 1, campaign_id: this.mode, cIndex: d.floor, eIndex: d.floor,
        gp: d.totalGp ?? 0, time: 0, items: Object.entries(d.items ?? {})
          .map(([template_id, count]) => ({ template_id: Number(template_id), count })) }],
      dropItems: [],
    } };
  }
  collectChest(): CityPacket[] {
    const d = this.progress();
    for (const drop of this.chestDrops(this.map * 100 + 3))
      (d.items ??= {})[drop.templateId] =
        (d.items![drop.templateId] ?? 0) + drop.count;
    (d.claimed ??= []).push(d.floor);
    this.synchronize();
    if (this.active) this.saveLocation();
    return [
      this.nodeUpdate(this.nodes().find((node) => node.master_type === 61)!),
      { opcode: 4205, message: this.tower() },
      this.list(),
    ];
  }
  usePortal(): CityPacket[] | undefined {
    if (
      !this.floorCleared ||
      (this.saved.battle && !this.saved.battle.finished)
    )
      return;
    if (labyrinthFloors.get(this.map)!.nodes.some(node => node.master_type === 61) &&
        !this.progress().claimed?.includes(this.progress().floor))
      throw new LabyrinthError("Colete o baú deste piso antes de usar o portal.");
    if (this.finalFloor) {
      this.progress().completed = true;
      this.synchronize();
      return [];
    }
    this.progress().floor++;
    delete this.saved.battle;
    const packets = this.enter();
    packets.find((p) => p.opcode === 125)!.message!.created_type = 3;
    this.saveLocation(3);
    return packets;
  }
}
