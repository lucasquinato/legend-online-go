import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { CitySave } from "../../city-world.js";
import type { CityPacket } from "../../city-state.js";
import type { Message } from "../../messages.js";
import type { CurrencyLedger } from "../currencies/index.js";
import { LabyrinthError, type LabyrinthFeature } from "./index.js";
import { labyrinthLimit, type LabyrinthMode } from "./content.js";

const config = JSON.parse(readFileSync(join(projectRoot, "reference/settlement-tables.json"), "utf8")).ConfigInfos as { ConfigName: string; ConfigValue: string }[];
export const labyrinthBotGold = Number(config.find(c => c.ConfigName === "Tower_Sweep_Gold")!.ConfigValue);
export const labyrinthBotSeconds = Number(config.find(c => c.ConfigName === "Tower_Sweep_Time")!.ConfigValue);
export interface LabyrinthBotSave {
  id: string;
  mode: LabyrinthMode;
  start: number;
  end: number;
  completed: number;
  nextAt: number;
  ended: boolean;
  dismissed?: boolean;
  results: Message[];
}
/** The persisted deadline also advances while the account is disconnected. */
export class LabyrinthBot {
  constructor(private saved: CitySave, private maze: LabyrinthFeature,
    private userId: number, private ledger: CurrencyLedger, private now: () => number,
    private begin: (mode: LabyrinthMode, multiplier: 1 | 2) => void,
    private award: (floor: number) => Message) {}
  get active(): boolean { return !!this.maze.data.bot && !this.maze.data.bot.ended; }
  private remaining(): number {
    const s = this.maze.data.bot!;
    return s.end - s.start + 1 - s.completed;
  }
  private pending(): Message {
    const s = this.maze.data.bot!;
    return { type: 2, campaign_id: s.mode, cIndex: s.start + s.completed, eIndex: s.end,
      time: Math.max(0, Math.ceil((s.nextAt + (this.remaining() - 1) * labyrinthBotSeconds * 1000 - this.now()) / 1000)), items: [] };
  }
  private response(status: number, result: Message[] = []): CityPacket {
    const s = this.maze.data.bot;
    return { opcode: 4425, message: { status, sweep_type: 2, campaign_id: s?.mode ?? 8001,
      total_gp: s?.results.reduce((n, r) => n + Number(r.gp ?? 0), 0) ?? 0, result, dropItems: [] } };
  }
  snapshot(): CityPacket[] {
    const s = this.maze.data.bot;
    return !s || s.dismissed ? [] : [this.response(1, [...s.results, ...(!s.ended ? [this.pending()] : [])]), ...(s.ended ? [this.response(11)] : [])];
  }
  handle(r: Message): CityPacket[] {
    const op = Number(r.op_type);
    if (![1, 2, 3, 4].includes(op)) throw new LabyrinthError("Operação de bot inválida.");
    if (op === 1) {
      if (this.active) return [this.response(1, [this.pending()])];
      const mode = Number(r.campaign_id) as LabyrinthMode, end = Number(r.e_index);
      if (![8001, 8101].includes(mode)) throw new LabyrinthError("Labirinto inválido.");
      this.maze.assertAccess(mode);
      if (this.saved.map !== 1 || (this.saved.battle && !this.saved.battle.finished) || (this.saved.sweep && !this.saved.sweep.ended))
        throw new LabyrinthError("Volte à cidade e encerre a batalha ou o outro bot.");
      this.maze.renewDailyRun(mode);
      const p = this.maze.progress(mode), start = p.floor + (p.cleared.includes(p.floor) ? 1 : 0);
      if (!Number.isSafeInteger(end) || end < start || end > Math.min(p.record ?? 0, labyrinthLimit(mode)))
        throw new LabyrinthError("O bot percorre apenas pisos já vencidos e ainda pendentes na rodada atual.");
      if (![1, 2].includes(r.enter_type)) throw new LabyrinthError("Modalidade de entrada inválida.");
      const id = randomUUID();
      this.ledger.change(this.saved.state, this.userId, "gold", -(end - start + 1) * labyrinthBotGold, "labyrinth:bot:start", `labyrinth:bot:${id}:start`);
      this.begin(mode, r.enter_type);
      p.entered = true;
      p.floor = start;
      this.maze.data.bot = { id, mode, start, end, completed: 0, nextAt: this.now() + labyrinthBotSeconds * 1000, ended: false, results: [] };
      this.maze.synchronize();
      return [this.response(1, [this.pending()]), ...this.updates()];
    }
    if (!this.maze.data.bot) return [];
    if (op === 2 && this.active) {
      if (![1, 2].includes(r.pay_type)) throw new LabyrinthError("Moeda de aceleração inválida.");
      const s = this.maze.data.bot!, cost = Math.ceil(Number(this.pending().time) / 60);
      this.ledger.change(this.saved.state, this.userId, r.pay_type === 1 ? "diamonds" : "boundDiamonds", -cost,
        "labyrinth:bot:accelerate", `labyrinth:bot:${s.id}:accelerate`);
      s.nextAt = this.now() - (this.remaining() - 1) * labyrinthBotSeconds * 1000;
    }
    const packets = op === 4 ? [] : this.tick();
    if (op === 4) {
      const s = this.maze.data.bot!;
      if (!s.ended) {
        this.ledger.change(this.saved.state, this.userId, "gold", this.remaining() * labyrinthBotGold, "labyrinth:bot:pause", `labyrinth:bot:${s.id}:pause`);
        s.ended = true;
        packets.push(this.response(15), ...this.updates());
      }
      s.dismissed = true;
    }
    return packets.length ? packets : [this.response(9)];
  }
  private updates(): CityPacket[] {
    return [3, 109, 113, 150, 115, 112, 4205, 4373, 4725].map(opcode => ({ opcode, message: {} }));
  }
  tick(): CityPacket[] {
    if (!this.active || this.now() < this.maze.data.bot!.nextAt) return [];
    const s = this.maze.data.bot!, results: Message[] = [];
    this.maze.selectMode(s.mode);
    while (this.remaining() > 0 && this.now() >= s.nextAt) {
      const floor = s.start + s.completed;
      const reward = this.award(floor);
      const row = { ...reward, type: 1, gold: labyrinthBotGold, campaign_id: s.mode, cIndex: floor, eIndex: s.end, time: 0 };
      results.push(row);
      s.results.push(row);
      s.completed++;
      s.nextAt += labyrinthBotSeconds * 1000;
      const p = this.maze.progress();
      p.floor = Math.min(floor + 1, labyrinthLimit(s.mode));
      p.completed = floor === labyrinthLimit(s.mode);
    }
    s.ended = this.remaining() === 0;
    this.maze.synchronize();
    if (!s.ended) results.push(this.pending());
    // Status 9 exits the Flash handler before committing new results.
    return [this.response(s.ended ? 11 : 0, results), ...this.updates()];
  }
}
