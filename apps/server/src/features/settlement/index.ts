import type { CitySave } from "../../city-world.js";
import type { Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import {
  type CurrencyLedger,
  currencyBalance,
  CurrencyError,
} from "../currencies/index.js";
import { type Store } from "../../store.js";
import { AttributeCalculator } from "../../attributes.js";
import { gameDay } from "../../game-clock.js";
import { sanctuaryBonus, TAX_COOLDOWN_MS } from "./balance.js";
import {
  buildingTemplates,
  buildingAt,
  researchSons,
  troopFamilies,
  pawnTemplates,
  effectTemplates,
  upgrade,
} from "./content.js";

export interface SettlementSave {
  version: 1;
  goldAt: number;
  goldCarry: number;
  goldRate: number;
  level: number;
  taxDay: string;
  taxes: number;
  taxReadyAt: number;
  lastTaxAt?: number;
  taxCalendarVersion?: 1;
  formation: { hero: number; pawn: number };
  attributesMigrated?: boolean;
}
export class SettlementError extends Error {}
export class SettlementFeature {
  constructor(
    private saved: CitySave,
    private store: Store,
    private userId: number,
    private uid: number,
    private ledger: CurrencyLedger,
    private now: () => number,
  ) {}
  get state() {
    return this.saved.state;
  }
  get data(): SettlementSave {
    return (this.saved.settlement ??= {
      version: 1,
      goldAt: this.now(),
      goldCarry: 0,
      goldRate: Number(this.state.economy.gold_yield ?? 0),
      level: 0,
      taxDay: "",
      taxes: 0,
      taxReadyAt: 0,
      formation: {
        hero: Number(this.state.hero.fight_pos) === 1 ? 1 : 3,
        pawn: Number(this.state.hero.fight_pos) === 1 ? 3 : 1,
      },
    });
  }
  /** Settle elapsed time at the old rate before changing the building/research level. */
  accrue(): number {
    const d = this.data,
      until = this.now(),
      elapsed = Math.max(0, until - d.goldAt);
    if (!elapsed) return 0;
    const numerator = elapsed * d.goldRate + d.goldCarry;
    const amount = Math.min(
      Math.floor(numerator / 3600000),
      Math.max(
        0,
        Number(this.state.economy.gold_max ?? 2147483647) -
          currencyBalance(this.state, "gold"),
      ),
    );
    if (amount)
      this.ledger.change(
        this.state,
        this.userId,
        "gold",
        amount,
        "townhall:production",
        `townhall:${d.goldAt}:${until}`,
      );
    d.goldCarry =
      currencyBalance(this.state, "gold") >=
      Number(this.state.economy.gold_max ?? 2147483647)
        ? 0
        : numerator % 3600000;
    d.goldAt = Math.max(d.goldAt, until);
    return amount;
  }
  synchronize(): void {
    const d = this.data,
      level = Number(this.state.player.grades);
    this.accrue();
    // Research IDs are buildings in the protocol too. Only physical upgradeable buildings auto-level.
    for (const b of Object.values(this.state.buildings)) {
      const old = buildingTemplates.get(Number(b.template_id));
      if (
        old &&
        Number(old.MasterType) < 13 &&
        buildingAt(Number(b.son_type), level)
      )
        b.template_id = Number(
          buildingAt(Number(b.son_type), level)!.TemplateId,
        );
    }
    for (const son of researchSons) {
      let b = Object.values(this.state.buildings).find(
        (b) => Number(b.son_type) === son,
      );
      if (!b)
        this.state.buildings[this.uid * 100000 + son] = b = {
          building_id: this.uid * 100000 + son,
          son_type: son,
          template_id: Number(buildingAt(son, 0)!.TemplateId),
          propterty1: 0,
          propterty2: 0,
        };
      const previous = buildingTemplates.get(b.template_id)!;
      const capped =
        son >= 2000 && level < 50
          ? 0
          : Math.min(Number(previous.BuildingGrade), level);
      b.template_id = Number(buildingAt(son, capped)!.TemplateId);
    }
    const hall = Object.values(this.state.buildings).find(
      (b) => b.son_type === 901,
    );
    const day = gameDay(this.now());
    if (d.taxCalendarVersion !== 1) {
      d.lastTaxAt ??= d.taxReadyAt > 0 ? d.taxReadyAt - TAX_COOLDOWN_MS : 0;
      d.taxDay = gameDay(d.lastTaxAt || this.now());
      d.taxCalendarVersion = 1;
    }
    if (d.taxDay !== day) {
      d.taxDay = day;
      d.taxes = 0;
    }
    if (hall) {
      hall.propterty1 = d.taxes;
      hall.propterty2 = 5;
    }
    this.syncAttributes();
    this.synchronizeProduction();
    d.level = level;
    this.state.hero.fight_pos = d.formation.hero;
    this.syncTroops();
  }
  effects(mode?: "common" | "advanced"): Record<number, number> {
    const effects: Record<number, number> = { 104: 0 };
    for (const b of Object.values(this.state.buildings)) {
      if (!researchSons.includes(b.son_type)) continue;
      if (mode && (b.son_type >= 2000) !== (mode === "advanced")) continue;
      const row = buildingTemplates.get(b.template_id),
        level = Number(row?.BuildingGrade ?? 0),
        effect = effectTemplates.get(Number(row?.Property1));
      if (!effect || !level) continue;
      for (let i = 1; i <= 3; i++) {
        const type = (Number(effect[`PropertyType${i}`]) % 100) + 100;
        // Activity is the cumulative bonus shown by the client at this exact level.
        const shown =
          i === 1
            ? String(row?.Activity ?? "").match(/\+\s*(\d+(?:\.\d+)?)/)?.[1]
            : undefined;
        effects[type] =
          (effects[type] ?? 0) +
          (shown === undefined
            ? (i === 1 ? sanctuaryBonus(b.son_type, level) : undefined) ?? Number(effect[`Property${i}`] ?? 0) * level
            : Number(shown));
      }
    }
    return effects;
  }
  syncAttributes(): void {
    if (!this.saved.attributes) return;
    this.data.attributesMigrated = true;
    for (const [id, mode] of [["sanctuary", "common"], ["sanctuaryAdvanced", "advanced"]] as const)
      this.saved.attributes.sources[id] = { kind: "permanent", evidence: "local-balance", values: { ...this.heroBonuses(mode), total_gold_production: this.effects(mode)[104] ?? 0 }, derivePrimary: true };
    this.saved.attributes.sources.townhall = { kind: "permanent", evidence: "local-balance", values: { total_gold_production: Number(buildingAt(901, Number(this.state.player.grades))!.Property1) } };
  }
  synchronizeProduction(): void {
    if (!this.saved.attributes) return;
    const rate = AttributeCalculator.calculate(this.saved.attributes).total_gold_production ?? 0;
    this.data.goldRate = rate;
    this.state.economy.gold_yield = rate;
  }
  private vipActive(): boolean {
    const vip = this.saved.vip;
    return !!vip && Number.isFinite(vip.level) && vip.level > 0 && Number.isFinite(vip.expiresAt) && vip.expiresAt > this.now();
  }
  private taxWait(): number {
    return this.vipActive() || !this.data.lastTaxAt ? 0 : Math.max(0, this.data.lastTaxAt + TAX_COOLDOWN_MS - this.now());
  }
  private heroBonuses(mode?: "common" | "advanced"): Record<string, number> {
    const e = this.effects(mode),
      v: Record<string, number> = {};
    for (const [type, key] of [
      [141, "total_phy_attack"],
      [142, "total_magic_attack"],
      [143, "total_phy_defence"],
      [144, "total_magic_defence"],
      [145, "total_live"],
      [146, "total_conat_army"],
    ] as const)
      v[key] = e[type] ?? 0;
    return v;
  }
  syncTroops(): void {
    const level = Number(this.state.player.grades),
      stock = (this.state.pawnStock ??= []),
      e = this.effects();
    for (const f of troopFamilies)
      if (!stock.some((p) => p.son_type === Number(f.SonType)))
        stock.push({
          army_id: 0,
          sites: 0,
          son_type: Number(f.SonType),
          tempate_id: Number(f.TemplateId),
          own_pawns: 0,
          pawnLive: [],
          fight_pos: 1,
          special_tempIds: "",
          comprehedn_tempIds: "",
          bless_num: 0,
        });
    for (const p of [...stock, ...(this.state.army.armyPawn ?? [])]) {
      let t = pawnTemplates.get(p.tempate_id);
      if (!t) continue;
      if (Number(t.Level) > level) {
        t = [...pawnTemplates.values()].find(
          (r) => Number(r.SonType) === p.son_type && Number(r.Level) === level,
        )!;
        p.tempate_id = Number(t.TemplateId);
      }
      p.pawnLive = [
        "Attack",
        "Defence",
        "MagicAttack",
        "MagicDefence",
        "Live",
        "ForceHit",
      ].map((key, i) => ({
        ...p.pawnLive?.[i],
        temp_data: Number(t![key]),
        skill_Data: e[[121, 122, 123, 124, 120, 0][i]!] ?? 0,
      }));
      p.fight_pos = this.data.formation.pawn;
    }
  }
  troop(op: number, r: Message): CityPacket[] {
    this.synchronize();
    const stock = this.state.pawnStock!,
      assigned = (this.state.army.armyPawn ??= []),
      row = stock.find((p) => p.tempate_id === r.tempate_id),
      t = pawnTemplates.get(r.tempate_id),
      barracks = Number(this.state.player.grades);
    if (
      !row ||
      !t ||
      Number(buildingTemplates.get(Number(t.NeedBuilding))?.BuildingGrade) >
        barracks
    )
      throw new SettlementError("Tropa ainda não liberada pelo quartel");
    const count = Number(r.own_pawns);
    if (op === 5158) {
      const next = pawnTemplates.get(Number(t.NextLevelTemplateId));
      if (!next || Number(next.Level) > barracks)
        throw new SettlementError(
          "Soldado não pode ultrapassar o nível do quartel/personagem",
        );
      if (barracks < 8)
        throw new SettlementError("Upgrade de tropas libera no nível 8");
      const cost = upgrade(1, Number(next.Level), Number(next.TemplateId));
      if (!cost) throw new SettlementError("Custo de espírito não encontrado");
      this.ledger.change(
        this.state,
        this.userId,
        "spirit",
        -Number(cost.Data),
        `troop:upgrade:${next.TemplateId}`,
      );
      for (const p of [
        row,
        ...assigned.filter((p: Message) => p.son_type === row.son_type),
      ])
        p.tempate_id = Number(next.TemplateId);
    } else {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new SettlementError("Quantidade de soldados inválida");
      if (op === 5155) {
        if (
          !count ||
          Number(this.state.economy.cur_population) +
            count * Number(t.NeedPopulation) >
            Number(this.state.economy.max_population)
        )
          throw new SettlementError("Capacidade da reserva insuficiente");
        const cost = Math.floor(
          Number(t.GoldConsume) *
            (1 - Number(buildingAt(402, barracks)?.Property4 ?? 0) / 100),
        );
        this.ledger.change(
          this.state,
          this.userId,
          "gold",
          -cost * count,
          `recruit:${t.TemplateId}`,
        );
        row.own_pawns += count;
        this.state.economy.cur_population += count * Number(t.NeedPopulation);
      } else if (op === 5157) {
        if (count > row.own_pawns)
          throw new SettlementError("Soldados insuficientes na reserva");
        row.own_pawns -= count;
        this.state.economy.cur_population -= count * Number(t.NeedPopulation);
      } else {
        if (r.sites !== 0)
          throw new SettlementError("Posição da tropa inválida");
        if (
          count * Number(t.NeedPopulation) >
          Number(this.state.hero.total_conat_army)
        )
          throw new SettlementError("Quantidade excede a infantaria do herói");
        const old = assigned.find((p: Message) => p.sites === 0);
        if (old) {
          const reserve = stock.find((p) => p.son_type === old.son_type)!;
          reserve.own_pawns += old.own_pawns;
        }
        if (count > row.own_pawns)
          throw new SettlementError("Soldados ainda não recrutados");
        row.own_pawns -= count;
        this.state.army.armyPawn = [
          {
            ...structuredClone(row),
            army_id: this.uid,
            sites: 0,
            own_pawns: count,
          },
        ];
      }
    }
    this.syncTroops();
    return [
      ...(op === 5158 ? [{ opcode: 116, message: row }] : []),
      ...[100, 93, 3, 109, 113, 150, 112].map((opcode) => ({
        opcode,
        message: {},
      })),
    ];
  }
  formation(r: Message): CityPacket[] {
    if (
      r.user_id !== this.uid ||
      ![1, 3].includes(r.hero_pos) ||
      ![1, 3].includes(r.pawn_pos) ||
      r.hero_pos === r.pawn_pos
    )
      throw new SettlementError("Formação inválida");
    this.data.formation = { hero: r.hero_pos, pawn: r.pawn_pos };
    this.state.hero.fight_pos = r.hero_pos;
    this.syncTroops();
    return [
      { opcode: 4186, message: { armyFightPos: [r] } },
      { opcode: 113, message: {} },
      { opcode: 93, message: {} },
      { opcode: 150, message: {} },
    ];
  }
  research(r: Message, onUpgraded?: (message: string) => void): CityPacket[] {
    this.synchronize();
    const b = this.state.buildings[r.building_id];
    if (!b) throw new SettlementError("Construção inexistente");
    if (!researchSons.includes(b.son_type))
      return [{ opcode: 4130, message: {} }];
    const level = Number(this.state.player.grades),
      previous = buildingTemplates.get(b.template_id)!,
      next = buildingTemplates.get(Number(previous.NextGradeTemplateId));
    if (b.son_type >= 2000 && level < 50)
      throw new SettlementError("Segunda aba do santuário libera no nível 50");
    if (!next || Number(next.BuildingGrade) > level)
      throw new SettlementError(
        "Pesquisa não pode ultrapassar o nível do santuário/personagem",
      );
    this.ledger.changeMany(
      this.state,
      this.userId,
      {
        gold: -Number(next.GoldConsume),
        lightCrystal: -Number(next.CrystalsConsume),
      },
      `sanctuary:upgrade:${next.TemplateId}`,
    );
    b.template_id = Number(next.TemplateId);
    this.syncAttributes();
    this.synchronize();
    const bonus = sanctuaryBonus(b.son_type, Number(next.BuildingGrade))!;
    const name = String(next.BuildingName), advanced = b.son_type >= 2000 && !/avan[çc]ad/i.test(name);
    onUpgraded?.(`[Santuário] ${name}${advanced ? " (avançado)" : ""} evoluiu com sucesso para o nível ${next.BuildingGrade}. Bônus: +${bonus}${[1304,2304].includes(b.son_type) ? " ouro/h" : ""}.`);
    return [
      { opcode: 4130, message: { result: 1, building: [structuredClone(b)] } },
      ...[113, 150, 100, 93, 109, 3].map((opcode) => ({
        opcode,
        message: {},
      })),
    ];
  }
  orders(): Message[] {
    const begin = new Date(this.now())
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    return [
      {
        order_id: 1,
        order_type: 1,
        remain_time: 0,
        user_id: this.uid,
        begin_time: begin,
        need_time: 0,
      },
      {
        order_id: 2,
        order_type: 2,
        remain_time: 0,
        user_id: this.uid,
        begin_time: begin,
        need_time: 0,
      },
      {
        order_id: 10,
        order_type: 3,
        remain_time: Math.max(
          0,
          Math.ceil(this.taxWait() / 1000),
        ),
        user_id: this.uid,
        begin_time: new Date(
          this.data.lastTaxAt || this.now(),
        )
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
        need_time: TAX_COOLDOWN_MS / 1000,
      },
    ];
  }
  taxes(op = 1, onCredit?: (gold: number) => void): CityPacket[] {
    this.synchronize();
    const d = this.data;
    // Two loaded sessions must not collect from the same stale daily counter.
    const row = this.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(this.userId);
    if (row) {
      const latest = JSON.parse(String(row.state)).settlement as SettlementSave | undefined;
      if (latest?.taxCalendarVersion === 1 && latest.taxDay === d.taxDay) {
        d.taxes = Math.max(d.taxes, latest.taxes);
        d.lastTaxAt = Math.max(d.lastTaxAt ?? 0, latest.lastTaxAt ?? 0);
      }
    }
    d.taxReadyAt = d.lastTaxAt ? d.lastTaxAt + TAX_COOLDOWN_MS : 0;
    if (
      this.state.player.grades < 10 ||
      d.taxes >= 5 ||
      this.taxWait() > 0
    )
      throw new SettlementError(
        "Impostos indisponíveis: nível 10, limite diário ou tempo de espera",
      );
    if (![1, 2].includes(op))
      throw new SettlementError("Operação de imposto inválida");
    if (op === 2 && !this.vipActive())
      throw new SettlementError("Colete um imposto por vez; intervalo de 10 minutos entre coletas");
    const times = op === 2 ? 5 - d.taxes : 1;
    // One collection grants one hour of the same total rate used by passive production.
    const value = d.goldRate;
    const credited = this.ledger.change(
      this.state,
      this.userId,
      "gold",
      value * times,
      "townhall:tax",
      `tax:${d.taxDay}:${d.taxes}`,
    );
    if (!credited) throw new SettlementError("Coleta de impostos já processada");
    onCredit?.(value * times);
    d.taxes += times;
    d.lastTaxAt = this.now();
    d.taxReadyAt = d.lastTaxAt + TAX_COOLDOWN_MS;
    this.synchronize();
    return [
      { opcode: 151, message: this.orders()[2]! },
      { opcode: 4242, message: { left_impose: d.taxes, max_impose: 5 } },
      { opcode: 109, message: {} },
    ];
  }
}
