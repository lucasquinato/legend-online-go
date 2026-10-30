import { randomUUID } from "node:crypto";
import type { CitySave } from "../../city-world.js";
import type { Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import { CurrencyError, type CurrencyLedger } from "../currencies/index.js";
import { campaignDefinitions, type CampaignDefinition } from "./content.js";
import { sweepGold, sweepSeconds } from "./rules.js";
import { reserveHeroEntries, heroEntries } from "./hero-limit.js";

export interface SweepSave {
  id: string;
  campaignId: number;
  count: number;
  completed: number;
  nextAt: number;
  ended: boolean;
  dismissed?: boolean;
  heroDay?: string;
  cancelled?: boolean;
  results: Message[];
  notified: number;
}
export class CampaignSweep {
  constructor(
    private saved: CitySave,
    private userId: number,
    private ledger: CurrencyLedger,
    private now: () => number,
    private cleared: () => number[],
    private award: (definition: CampaignDefinition, key: string) => Message,
  ) {}
  get active(): boolean {
    return !!this.saved.sweep && !this.saved.sweep.ended;
  }
  private response(status: number, results: Message[] = []): CityPacket {
    const s = this.saved.sweep;
    return {
      opcode: 4425,
      message: {
        status,
        sweep_type: 1,
        campaign_id: s?.campaignId ?? 0,
        total_gp: s?.results.reduce((n, r) => n + Number(r.gp ?? 0), 0) ?? 0,
        result: results,
        dropItems: [],
      },
    };
  }
  private pending(): Message {
    const s = this.saved.sweep!;
    return {
      type: 2,
      campaign_id: s.campaignId,
      finishCount: s.completed,
      count: s.count,
      time: Math.max(
        0,
        Math.ceil(
          (s.nextAt +
            (s.count - s.completed - 1) * sweepSeconds * 1000 -
            this.now()) /
            1000,
        ),
      ),
      items: [],
    };
  }
  snapshot(): CityPacket[] {
    const s = this.saved.sweep;
    if (!s || s.dismissed) return [];
    // Replay a full UI history only on reconnect; rewards were already committed.
    return [
      this.response(1, [...s.results, ...(!s.ended ? [this.pending()] : [])]),
      ...(s.ended ? [this.response(11)] : []),
    ];
  }
  handle(r: Message): CityPacket[] {
    if (r.sweep_type !== 1)
      throw new CurrencyError("Modalidade de bot ainda não reconstruída");
    const op = Number(r.op_type);
    if (op === 1) {
      if (this.active) return [this.response(1, [this.pending()])];
      const d = campaignDefinitions.get(Number(r.campaign_id)),
        count = Number(r.count);
      if (
        !d ||
        !this.cleared().includes(d.id) ||
        this.saved.state.player.grades < 20
      )
        throw new CurrencyError(
          "Bot exige nível 20 e uma conclusão prévia desta fase",
        );
      if (
        this.saved.map !== 1 ||
        (this.saved.battle && !this.saved.battle.finished)
      )
        throw new CurrencyError(
          "Saia da campanha ou batalha antes de iniciar o bot",
        );
      if (!Number.isSafeInteger(count) || count < 1 || count > 10)
        throw new CurrencyError("Quantidade de tentativas inválida");
      if (r.open_silver_box || r.open_secret_box)
        throw new CurrencyError(
          "Abertura automática de baús não foi reconstruída; desmarque essas opções",
        );
      const id = randomUUID();
      const heroDay =
        d.definition.DifficultyGrade === "2"
          ? reserveHeroEntries(this.saved, count, this.now())
          : undefined;
      this.ledger.changeMany(
        this.saved.state,
        this.userId,
        { energy: -20 * count, gold: -sweepGold * count },
        "campaign:bot:start",
        `sweep:${id}:start`,
      );
      this.saved.sweep = {
        id,
        campaignId: d.id,
        count,
        completed: 0,
        nextAt: this.now() + sweepSeconds * 1000,
        ended: false,
        results: [],
        notified: 0,
        heroDay,
      };
      return [
        this.response(1, [this.pending()]),
        { opcode: 3, message: {} },
        { opcode: 109, message: {} },
        { opcode: 4948, message: {} },
      ];
    }
    if (!this.saved.sweep) return [];
    if (op === 2)
      throw new CurrencyError("Aceleração paga do bot ainda não reconstruída");
    const output = this.tick();
    if (op === 4 && this.active) {
      const s = this.saved.sweep!,
        remaining = s.count - s.completed;
      this.ledger.changeMany(
        this.saved.state,
        this.userId,
        { energy: 20 * remaining, gold: sweepGold * remaining },
        "campaign:bot:cancel",
        `sweep:${s.id}:cancel`,
      );
      s.ended = true;
      s.cancelled = true;
      heroEntries(this.saved, this.now());
      if (s.heroDay === this.saved.heroEntries!.day)
        this.saved.heroEntries!.used = Math.max(
          0,
          this.saved.heroEntries!.used - remaining,
        );
      output.push(
        this.response(15),
        { opcode: 3, message: {} },
        { opcode: 109, message: {} },
        { opcode: 4948, message: {} },
      );
    } else if (op === 3 && output.length === 0) {
      // Repeated polls acknowledge elapsed time without replaying XP in the client.
      output.push(
        this.response(
          this.active ? 9 : 11,
          this.active ? [this.pending()] : [],
        ),
      );
    } else if (![3, 4].includes(op))
      throw new CurrencyError("Operação de bot inválida");
    if (op === 4) this.saved.sweep.dismissed = true;
    return output;
  }
  tick(): CityPacket[] {
    const s = this.saved.sweep;
    if (!s || s.ended || this.now() < s.nextAt) return [];
    const results: Message[] = [];
    while (s.completed < s.count && this.now() >= s.nextAt) {
      const reward = this.award(
        campaignDefinitions.get(s.campaignId)!,
        `sweep:${s.id}:${s.completed}`,
      );
      s.completed++;
      s.nextAt += sweepSeconds * 1000;
      const r = {
        ...reward,
        type: 1,
        campaign_id: s.campaignId,
        finishCount: s.completed,
        count: s.count,
        time: 0,
      };
      s.results.push(r);
      results.push(r);
    }
    s.ended = s.completed === s.count;
    s.notified = s.completed;
    if (!s.ended) results.push(this.pending());
    return [
      // Client status 9 returns before model.commit(); status 7 commits rows
      // without reopening the window. Status 11 commits the final row and ends.
      this.response(s.ended ? 11 : 7, results),
      { opcode: 3, message: {} },
      { opcode: 109, message: {} },
      { opcode: 115, message: {} },
      { opcode: 112, message: {} },
    ];
  }
}
