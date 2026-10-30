import { randomInt } from "node:crypto";
import type { Message } from "../../messages.js";
import type { CityPacket, CityState } from "../../city-state.js";
import { applyAttributes, AttributeCalculator, type AttributeSource, type AttributeState } from "../../attributes.js";
import type { Inventory } from "../../inventory.js";
import { InventoryError, inventoryUpdates, itemTemplate } from "../../inventory.js";
import { CurrencyError, CurrencyLedger, currencyBalance } from "../currencies/index.js";
import { cards, mounts, primaries, selectors, type Primary, fieldsByPrimary, trainingRows, trainingGrade, growthGrade, upgradeRows, config, shopPool, starShop, TRAIN_ITEM, STAR_ITEM, SOUL_ITEM } from "./content.js";
import { initialMounts, type MountSave, type MountOwned } from "./state.js";
import { mountRequest, generalPacket, collectionPackets, kingsPacket, shopPacket, avatarBody } from "./protocol.js";
import { advanceSoul, remainingSoulXP, soulCenterPercent, soulSidePercent } from "./soul.js";
import { updateMountObjectives } from "./quests.js";
import { kingAttribute } from "./kings.js";
import { mountTutorialAction } from "./tutorial-quests.js";

export class MountError extends Error {}
export interface MountContext {
  readonly state: CityState;
  readonly saved: { mounts?: MountSave; attributes?: AttributeState };
  readonly userId: number;
  readonly protocolUserId?: number;
  readonly ledger: CurrencyLedger;
  now(): number;
  inventory(): Inventory;
  persist(): void;
  atomic<T>(action: () => T): T;
}

/** Own-account state only. Captured mount lists are never a source of ownership. */
export class MountFeature {
  private expiryDeadline = 0;
  constructor(private readonly context: MountContext, private readonly roll = () => randomInt(1000000) / 1000000) {}
  get save(): MountSave { return this.context.saved.mounts ??= initialMounts(); }
  get available(): boolean { return Number(this.context.state.player.grades) >= 16; }
  get active(): MountOwned[] { return Object.values(this.save.owned).filter(row => row.expiresAt === null || row.expiresAt > this.context.now()); }
  get growthXP(): number { return primaries.reduce((sum, name) => sum + this.save.xp[name], 0); }
  get grade(): number { return growthGrade(this.growthXP); }
  get limit(): number { return Math.min(2500, 20 * this.grade + this.active.reduce((sum, row) => sum + Number(mounts.get(row.id)?.ExpandLevel ?? 0), 0)); }
  private owned(id: number): MountOwned | undefined { return this.active.find(row => row.id === id); }
  private createOwned(id: number, expiresAt: number | null = null): MountOwned {
    return { id, activatedAt: this.context.now(), expiresAt, stars: 0, blessing: 0, flightUnlocked: false };
  }
  synchronize(): void {
    this.expiryDeadline = Math.min(...Object.values(this.save.owned).map(row => row.expiresAt).filter((time): time is number => time !== null && time > this.context.now()), Infinity);
    if (this.available) for (const row of mounts.values()) if (Number(row.MountType) === 0 && Number(row.Property2) <= this.grade) this.save.owned[row.TemplateId] ??= this.createOwned(Number(row.TemplateId));
    if (!this.owned(this.save.selected)) this.save.selected = 1000;
    if (!this.available || !this.owned(this.save.selected)) this.save.mounted = false;
    const equipped = this.save.mounted ? this.owned(this.save.selected) : undefined;
    const definition = equipped ? mounts.get(equipped.id) : undefined;
    this.save.mobility = { mountId: equipped?.id ?? 0, mode: definition && (Number(definition.IsFly) === 1 || equipped!.flightUnlocked) ? "air-capable" : "ground", speed: equipped ? this.speed() : 0 };
    this.context.state.army.mount_tempId = equipped?.id ?? 0;
    this.context.state.army.mount_grade = equipped ? this.grade : 0;
    if (this.context.saved.attributes) this.context.saved.attributes.sources.mounts = this.attributeSource();
    // The panel must match the new source before CityWorld reconciles historical
    // attributes on save; otherwise reconciliation records the bonus as a debt.
    if (this.context.saved.attributes) applyAttributes(this.context.saved.attributes, this.context.state.hero);
    updateMountObjectives(this.context.state, this.grade);
  }
  speed(): number { return Math.max(0, ...this.active.map(row => Number(mounts.get(row.id)?.Speed ?? 0))); }
  rawPrimary(name: Primary): number {
    let total = trainingGrade(this.save.xp[name]) * 5;
    for (const owned of this.active) {
      const row = mounts.get(owned.id)!;
      const king = this.save.kings[owned.id];
      const stars = String(row.StarAddition ?? "").split(",").map(Number);
      total += Number(row.MountType) === 4 ? kingAttribute(owned.id, name, king) : Number(row[fieldsByPrimary[name]] ?? 0) + (owned.stars ? Number(stars[owned.stars - 1] ?? 0) : 0);
    }
    return total;
  }
  soulPercent(): number {
    return soulCenterPercent(this.save.soul);
  }
  finalPrimary(name: Primary): number {
    return AttributeCalculator.sourceValues(this.attributeSource())["total_" + name] ?? 0;
  }
  attributeSource(): AttributeSource {
    const values = Object.fromEntries(primaries.map(name => ["total_" + name, this.available ? this.rawPrimary(name) : 0]));
    return { kind: "permanent", evidence: "recovered-table", derivePrimary: true, values,
      scaling: primaries.map(name => ({ values: { ["total_" + name]: values["total_" + name]! }, percent: this.soulPercent(), cap: config("mount_refining_soul_value_max", 100000), finalPercent: soulSidePercent(this.save.soul.grades[name]), rounding: "ceil" })),
    };
  }
  general(opcode = 4426): CityPacket {
    return generalPacket({ mount_tempId: this.save.selected, power: this.rawPrimary("power"), intellect: this.rawPrimary("intellect"), physique: this.rawPrimary("physique"), agility: this.rawPrimary("agility"), speed: this.speed(), power_gp: this.save.xp.power, intellect_gp: this.save.xp.intellect, physique_gp: this.save.xp.physique, agility_gp: this.save.xp.agility, mount_totalGp: this.growthXP, level_max: this.limit, mount_starLv: this.owned(this.save.selected)?.stars ?? 0 }, primaries.map(name => this.save.soul.grades[name]), this.save.soul.xp, opcode);
  }
  list(): CityPacket[] {
    const rows = this.active;
    return collectionPackets(rows, rows.reduce((sum, row) => sum + Number(mounts.get(row.id)?.SoulScore ?? 0), 0), randomInt(1, 2147483647));
  }
  initialPackets(): CityPacket[] { this.synchronize(); return [this.general(), ...this.list(), kingsPacket(this.save.kings)]; }
  tick(): CityPacket[] {
    return this.expiryDeadline > 0 && this.context.now() >= this.expiryDeadline ? this.mutate(() => []) : [];
  }
  model(packet: CityPacket): CityPacket | undefined {
    if ([4426, 4459].includes(packet.opcode)) return this.general(packet.opcode);
    if (packet.opcode === 4427) return this.list()[0];
    if (packet.opcode === 4973) return kingsPacket(this.save.kings);
    if (packet.opcode === 4975) return shopPacket(this.save.shop);
    return undefined;
  }
  private count(count: number): void { if (!Number.isSafeInteger(count) || count < 1 || count > 9999) throw new MountError("Quantidade de adestramento inválida (1–9999)."); }
  private materialCount(id: number): number {
    return this.context.inventory().countTemplate(id);
  }
  private payTraining(actual: number, allowBound: boolean): number {
    const stones = Math.min(actual, this.materialCount(TRAIN_ITEM)), price = (actual - stones) * config("Mount_Point", 5);
    const bound = allowBound ? Math.min(price, currencyBalance(this.context.state, "boundDiamonds")) : 0;
    if (currencyBalance(this.context.state, "diamonds") < price - bound) throw new CurrencyError("Diamantes ou Pedra Bestial insuficientes");
    if (stones) this.context.inventory().consumeTemplate(TRAIN_ITEM, stones);
    if (price) this.context.ledger.changeMany(this.context.state, this.context.userId, { boundDiamonds: -bound, diamonds: -(price - bound) }, "mounts:training");
    return stones;
  }
  train(name: Primary, count: number, allowBound: boolean): number {
    this.count(count);
    const expansion = this.active.reduce((sum, row) => sum + Number(mounts.get(row.id)?.ExpandLevel ?? 0), 0);
    let actual = 0;
    for (; actual < count; actual++) {
      const limit = Math.min(2500, 20 * this.grade + expansion);
      const max = Number(trainingRows[limit - 1]?.Data ?? 0);
      if (this.save.xp[name] >= max) break;
      // Each attempted stone/payment receives its own independent draw.
      this.save.xp[name] = Math.min(max, this.save.xp[name] + (this.roll() < 0.10 ? 50 : 10));
    }
    if (!actual) throw new MountError("Este atributo atingiu o limite de adestramento.");
    const stones = this.payTraining(actual, allowBound);
    mountTutorialAction(this.context.state, "stones", stones);
    this.synchronize();
    return actual;
  }
  refineSoul(count: number): number {
    if (Number(this.context.state.player.grades) < 80) throw new MountError("Refino Espiritual de Fera exige nível 80.");
    this.count(count);
    const needed = remainingSoulXP(this.save.soul);
    const actual = Math.min(count, needed, this.materialCount(SOUL_ITEM));
    if (!actual) throw new MountError(needed <= 0 ? "Refino espiritual no nível máximo." : "Coração do Refino da Fera insuficiente.");
    this.context.inventory().consumeTemplate(SOUL_ITEM, actual);
    advanceSoul(this.save.soul, actual);
    return actual;
  }
  private eligibleStars(id: number): MountOwned {
    if (Number(this.context.state.player.grades) < 70) throw new MountError("Refinação por estrelas exige nível 70.");
    const owned = this.owned(id), row = mounts.get(id);
    if (!owned || !row || owned.expiresAt !== null || [3, 4, 5].includes(Number(row.MountType)) || !Number(row.GradeType)) throw new MountError("Esta montaria não pode receber estrelas.");
    return owned;
  }
  star(id: number, advanced: boolean): void {
    const owned = this.eligibleStars(id), row = mounts.get(id)!;
    // The original collection exposes the first ordinary refinement as free.
    // A guaranteed first star also makes that introductory state end naturally.
    if (!this.active.some(mount => ![3, 4, 5].includes(Number(mounts.get(mount.id)?.MountType)) && (mount.stars > 0 || mount.blessing > 0))) {
      if (advanced) throw new MountError("Conclua a primeira refinação simples antes da avançada.");
      owned.stars = 1; owned.blessing = 0; return;
    }
    const maximum = String(row.StarAddition).split(",").length;
    const count = advanced ? 10 : 1;
    let actual = 0;
    for (; actual < count && owned.stars < maximum; actual++) {
      if (this.materialCount(STAR_ITEM) <= actual) break;
      const target = upgradeRows(37, Number(row.GradeType)).find(row => Number(row.Grades) === owned.stars + 1);
      if (!target) throw new MountError("Tabela de bênção da montaria indisponível.");
      if (owned.blessing >= Number(target.Data) || this.roll() < 0.05) { owned.stars++; owned.blessing = 0; }
      else owned.blessing++;
    }
    if (!actual) throw new MountError(owned.stars >= maximum ? "Montaria no máximo de estrelas." : "Armação da Fera insuficiente.");
    this.context.inventory().consumeTemplate(STAR_ITEM, actual);
  }
  trainKing(id: number, count: number, allowBound: boolean): number {
    if (Number(this.context.state.player.grades) < 70 || Number(mounts.get(id)?.MountType) !== 4 || !this.owned(id)) throw new MountError("Rei das Feras não ativado ou nível insuficiente.");
    this.count(count);
    const king = this.save.kings[id] ??= { level: 0, xp: 0 };
    let actual = 0;
    for (; actual < count && king.level < 180; actual++) {
      // 16 captured batches resolve exactly to 50 XP per stone for kings.
      king.xp += 50;
      while (king.level < 180) {
        const next = upgradeRows(109).find(row => Number(row.Grades) === king.level + 1)!;
        if (king.xp < Number(next.Data)) break;
        king.xp -= Number(next.Data); king.level++;
      }
      if (king.level === 180) king.xp = 0;
    }
    if (!actual) throw new MountError("Rei das Feras no nível máximo.");
    this.payTraining(actual, allowBound);
    return actual;
  }
  private activate(id: number, duration: number | null): void {
    const row = mounts.get(id);
    if (!row || this.grade < Number(row.NeedMountGrade)) throw new MountError("Grau geral insuficiente para essa montaria.");
    const previous = this.save.owned[id];
    const expiresAt = duration === null ? null : Math.max(this.context.now(), previous?.expiresAt ?? 0) + duration;
    this.save.owned[id] = previous ? { ...previous, expiresAt } : this.createOwned(id, expiresAt);
    if (Number(row.MountType) === 4) this.save.kings[id] ??= { level: 0, xp: 0 };
  }
  useCard(request: Message): CityPacket[] | undefined {
    const key = `${request.bag_type}:0:${request.pos}`, item = this.context.state.items[key], card = cards.get(Number(item?.template_id));
    if (!card) return undefined;
    return this.mutate(() => {
      this.assertAvailable();
      if (request.bag_type !== 1 || Number(this.context.state.player.grades) < Number(card.NeedGrades)) throw new MountError("Cartão indisponível nesta bolsa ou nível insuficiente.");
      const count = Number(request.count); this.count(count);
      if (count > Number(item!.count)) throw new MountError("Quantidade de cartões insuficiente.");
      const id = Number(card.Property1), row = mounts.get(id)!, owned = this.owned(id), permanent = Number(card.Property2) === -1;
      if (this.grade < Number(card.Property3 ?? row.NeedMountGrade)) throw new MountError("Grau geral insuficiente para o cartão.");
      if (owned?.expiresAt === null) {
        if (!permanent || Number(card.Refresh) === -1) throw new MountError("Esta montaria já é permanente; este cartão não pode ser convertido.");
        const reward = Number(row.Power) * config("mount_card_resolve_multiple", 4) * count;
        if (reward <= 0) throw new MountError("Conversão desse cartão indisponível.");
        this.context.ledger.change(this.context.state, this.context.userId, "mountEssence", reward, "mounts:duplicate-card");
        this.context.inventory().consume(key, count);
      } else {
        // A new permanent activation consumes one card. Subsequent cards require
        // the existing client's duplicate-card confirmation on their next use.
        const consumed = permanent ? 1 : count;
        if (!permanent && Number(card.Property2) <= 0) throw new MountError("Duração do cartão inválida.");
        this.activate(id, permanent ? null : Number(card.Property2) * consumed * 86400000);
        this.context.inventory().consume(key, consumed);
      }
      return [];
    });
  }
  private refreshShop(): void {
    const pool = shopPool.filter(row => !this.owned(Number(cards.get(row.item)!.Property1)));
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(this.roll() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]; }
    this.save.shop = shuffled.slice(0, config("mount_shop_item_count", 30)).map(row => ({ ...row, purchased: false }));
  }
  /** Normal shop/cart protocol; prices come from the recovered shop table. */
  buyStarMaterial(opcode: number, request: Message): CityPacket[] | undefined {
    if (![5154, 8970].includes(opcode)) return;
    const entries = opcode === 5154
      ? [{ shopId: request.buyInfo?.good_id, counts: request.buyInfo?.count, payType: request.pay_type ?? 0 }]
      : request.carItemInfo;
    if (!Array.isArray(entries) || !entries.some(entry => starShop.some(row => Number(row.Id) === Number(entry.shopId)))) return;
    return this.mutate(() => {
      const receiver = opcode === 5154 ? request.buyInfo?.receive_id : request.receiveUserId;
      if ((receiver && ![this.context.userId, this.context.protocolUserId].includes(Number(receiver))) || !entries.length || entries.length > 20)
        throw new MountError("Compra de ferradura inválida; envie apenas para sua conta.");
      for (const entry of entries) {
        const offer = starShop.find(row => Number(row.Id) === Number(entry.shopId));
        const count = Number(entry.counts), payType = Number(entry.payType);
        this.count(count);
        if (!offer || ![0, 1, 2].includes(payType) || Number(this.context.state.player.grades) < Number(offer.NeedGrades))
          throw new MountError("O carrinho deve conter apenas ferraduras válidas.");
        const unitPrice = Number(offer.Point) || Number(offer.GiftToken);
        if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) throw new MountError("Preço da ferradura indisponível.");
        const price = unitPrice * count;
        const bound = payType !== 1 && Number(offer.GiftToken) > 0 ? Math.min(price, currencyBalance(this.context.state, "boundDiamonds")) : 0;
        this.context.ledger.changeMany(this.context.state, this.context.userId,
          { boundDiamonds: -bound, diamonds: -(price - bound) }, "mounts:star-material-shop");
        this.context.inventory().add({ template_id: STAR_ITEM, bag_type: 1, object_id: 0, pos: -1, bind: 1, used: 0,
          strengthen_grade: 0, join_1: -1, join_2: -1, join_3: -1, join_4: -1 }, count);
      }
      return [opcode === 5154
        ? { opcode: 90, message: { buyInfo: { ...request.buyInfo, result: 1 } } }
        : { opcode: 4783, message: { ...request, result: 1 } }];
    });
  }
  private assertAvailable(): void { if (!this.available) throw new MountError("Montarias são liberadas no nível 16."); }
  private mutate(action: () => CityPacket[]): CityPacket[] {
    return this.context.atomic(() => {
      const before = structuredClone(this.context.state.items);
      const events = action(); this.synchronize(); this.context.persist();
      return [...events, { opcode: 115, message: { moved: inventoryUpdates(before, this.context.state.items) } }, { opcode: 3, message: {} }, { opcode: 4725, message: {} }, { opcode: 113, message: {} }, { opcode: 150, message: {} }, this.general(), ...this.list(), kingsPacket(this.save.kings), { opcode: 112, message: {} }];
    });
  }
  handle(opcode: number, body: Buffer): CityPacket[] | undefined {
    if (opcode === 8530) return this.initialPackets();
    if (opcode !== 8529) return undefined;
    const r = mountRequest(body);
    if (r.op === 5) return [this.general(4459)];
    return this.mutate(() => {
      this.assertAvailable();
      switch (r.op) {
        case 1: { const name = selectors[r.property_type]; if (!name) throw new MountError("Atributo de montaria inválido."); this.train(name, r.param1, r.pay_type === 0); break; }
        case 2: if (!this.owned(r.param1)) throw new MountError("Montaria não ativada ou vencida."); this.save.selected = r.param1; break;
        case 3: {
          if (![0, 1].includes(r.param1)) throw new MountError("Estado de montaria inválido.");
          if (r.param1 && this.owned(this.save.selected)) mountTutorialAction(this.context.state, "mount");
          this.save.mounted = Boolean(r.param1); break;
        }
        case 4: {
          const row = mounts.get(r.param1);
          if (!row || [0, 3, 5].includes(Number(row.MountType))) throw new MountError("Ative esta montaria pelo sistema correspondente.");
          if (this.owned(r.param1)) throw new MountError("Montaria já ativada.");
          if (Number(row.MountType) === 4) {
            if (Number(this.context.state.player.grades) < 70) throw new MountError("Rei das Feras exige nível 70.");
            this.context.inventory().consumeTemplate(2131500, 1); this.activate(r.param1, null);
          } else {
            const card = cards.get(Number(row.NeedItemId));
            if (card && Number(this.context.state.player.grades) < Number(card.NeedGrades)) throw new MountError("Nível insuficiente para ativar esta montaria.");
            if (card && this.materialCount(Number(card.TemplateId))) {
              this.context.inventory().consumeTemplate(Number(card.TemplateId), 1); this.activate(r.param1, Number(card.Property2) === -1 ? null : Number(card.Property2) * 86400000);
            } else {
              const price = Number(row.Property1);
              if (!Number.isSafeInteger(price) || price <= 0) throw new MountError("Cartão necessário para ativar esta montaria.");
              const bound = r.pay_type === 0 ? Math.min(price, currencyBalance(this.context.state, "boundDiamonds")) : 0;
              this.context.ledger.changeMany(this.context.state, this.context.userId, { boundDiamonds: -bound, diamonds: -(price - bound) }, "mounts:activation"); this.activate(r.param1, null);
            }
          }
          break;
        }
        case 6: this.star(r.property_type, r.param1 === 1); return [{ opcode: 4679, body: avatarBody(this.owned(r.property_type)!).toString("base64") }];
        case 7: this.trainKing(r.param1, r.param2, r.pay_type === 0); return [kingsPacket(this.save.kings, 4974, r.param1)];
        case 8: if (!this.save.shop.length) this.refreshShop(); return [shopPacket(this.save.shop)];
        case 9: {
          const offer = this.save.shop[r.param2];
          if (!offer || offer.item !== r.param1 || offer.purchased || this.owned(Number(cards.get(offer.item)!.Property1))) throw new MountError("Oferta indisponível. Atualize a loja.");
          this.context.ledger.change(this.context.state, this.context.userId, "mountEssence", -offer.price, "mounts:shop");
          this.context.inventory().add({ template_id: offer.item, bag_type: 1, object_id: 0, pos: -1, bind: 1, used: 0, strengthen_grade: 0, join_1: -1, join_2: -1, join_3: -1, join_4: -1 }, 1);
          offer.purchased = true; return [shopPacket(this.save.shop)];
        }
        case 10: this.context.ledger.change(this.context.state, this.context.userId, "diamonds", -config("mount_shop_refresh_cost", 999), "mounts:shop-refresh"); this.refreshShop(); return [shopPacket(this.save.shop)];
        case 11: return [shopPacket(shopPool.map(row => ({ ...row, purchased: false })), 305)];
        case 12: this.refineSoul(r.param1); break;
        case 13: throw new MountError("Aquisição de voo pendente. Montarias voadoras já registram a capacidade de voo quando montadas.");
        default: throw new MountError("Operação de montaria indisponível.");
      }
      return [];
    });
  }
}
