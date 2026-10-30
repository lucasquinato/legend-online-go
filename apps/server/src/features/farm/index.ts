import { residencePolicy, animalShopRows } from "../residence/policy.js";
import { gameDay, nextGameReset } from "../../game-clock.js";
import type { Store } from "../../store.js";
import type { CitySave } from "../../city-world.js";
import type { Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import {
  type CurrencyLedger,
  currencyAnnexes,
  type Currency, CurrencyError,
} from "../currencies/index.js";
import {
  itemTemplate, InventoryError,
  type Inventory,
  inventoryUpdates,
} from "../../inventory.js";
import { grantExperience } from "../../progression.js";
import { SocialFeature, queueLocalEvent } from "../social/index.js";
import { configValue, upgrade, tables } from "../settlement/content.js";
import { randomInt } from "node:crypto";

for(const row of animalShopRows(tables.ShopTempInfos!.find(r=>Number(r.ShopType)===6)!))if(!tables.ShopTempInfos!.some(r=>Number(r.Id)===Number(row.Id)))tables.ShopTempInfos!.push(row);
export const FARM_SCHEMA = `CREATE TABLE IF NOT EXISTS local_farms(user_id INTEGER PRIMARY KEY,state TEXT NOT NULL);`;
export class FarmError extends Error {}
interface FarmSave {
  version: 1;
  model: Message;
  day: string;
  planted: number;
  treeWaterBy: Record<string, string>;
  ownWaterAt?: number;
  treePickedDay?: string;
  logs: Message[];
  specialDrops?: Record<string,number>;
  care?: Record<string, { at: number; flag: string; applied: boolean }>;
}
const date = (ms: number) =>
  new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const time = (s: string) => Date.parse(s.replace(" ", "T") + "Z");
const blank = (id: number, pos: number): Message => ({
  user_id: id,
  type: 0,
  pos,
  item_template_id: 0,
  add_time: date(0),
  feed_time: date(0),
  mature_time: date(0),
  crop_state: 0,
  accelerate_count: 0,
  stolen_count: 0,
  stolenUsers: [],
  is_worm: 0,
  is_grass: 0,
  is_ill: 0,
  is_gloomy: 0,
  is_hunger: 0,
  is_can_reap: 0,
  reward_count: 0,
});
export class FarmFeature {
  readonly social: SocialFeature;
  constructor(
    private saved: CitySave,
    private store: Store,
    private userId: number,
    private uid: number,
    private ledger: CurrencyLedger,
    private inventory: () => Inventory,
    private now: () => number,
  ) {
    this.social = new SocialFeature(store, userId);
  }
  private read(id = this.userId): FarmSave {
    const profile = this.social.profile(id);
    if (!profile)
      throw new FarmError("Fazenda de personagem local inexistente");
    const row = this.store.db
      .prepare("SELECT state FROM local_farms WHERE user_id=?")
      .get(id);
    let data: FarmSave;
    if (row) data = JSON.parse(String(row.state));
    else {
      const city = this.store.db
        .prepare("SELECT state FROM city_worlds WHERE user_id=?")
        .get(id);
      const old =
        id === this.userId
          ? this.saved.state.farms[this.uid]
          : city
            ? JSON.parse(String(city.state)).state.farms[this.uid]
            : undefined;
      const own = old
        ? structuredClone(old)
        : {
            grades: 1,
            land_grades: 1,
            gp: 0,
            total_gp: 0,
            today_from_friend_gp: 0,
            today_stolen_count: 0,
            today_feed_count: 0,
            today_help_reap_livestock: 0,
            farmLandInfo: [],
          };
      own.user_id = id;
      own.nick_name = profile.nickname;
      for (const p of own.farmLandInfo ?? []) {
        p.user_id = id;
        delete p.op_type;
        delete p.result;
      }
      own.tree_info = {
        userId: id,
        nickName: profile.nickname,
        waterCount: 0,
        fruitCount: 0,
        isFirstFruit: true,
        nextPickTime: date(this.now()),
        property1: 0,
        property2: 0,
        lastWaterTime: date(0),
        left_time: 0,
        left_pickTime: 0,
      };
      data = {
        version: 1,
        model: own,
        day: "",
        planted: (own.farmLandInfo ?? []).filter(
          (p: Message) => p.pos < 1000 && p.item_template_id,
        ).length,
        treeWaterBy: {},
        logs: [],
      };
    }
    this.refresh(data, id);
    return data;
  }
  private refresh(d: FarmSave, id: number): void {
    const f = d.model,
      day = gameDay(this.now()),
      level =
        id === this.userId
          ? this.saved.state.player.grades
          : Number(this.social.info(id).grades);
    f.guard_pet_info ??= {
      user_id: id,
      pet_id: 0,
      pos: -1,
      pet_template_id: 0,
      state: 0,
      pet_name: "",
      quality: 0,
    };
    if (d.day !== day) {
      d.day = day;
      f.today_from_friend_gp = 0;
      f.today_stolen_count = 0;
      f.today_feed_count = 0;
      f.today_help_reap_livestock = 0;
      f.tree_info.waterCount = 0;
      f.tree_info.fruitCount = 0;
      d.treeWaterBy = {};
    }
    f.grades = Math.min(Number(f.grades ?? 1), level);
    f.nick_name = this.social.profile(id)!.nickname;
    while (f.grades < level) {
      const next = upgrade(17, f.grades + 1);
      if (!next || f.gp < Number(next.Data)) break;
      f.gp -= Number(next.Data);
      f.grades++;
    }
    this.openSlots(f, id);
    for (const p of f.farmLandInfo) {
      if (!p.item_template_id) continue;
      const mature = time(p.mature_time),
        seed = itemTemplate(p.item_template_id)!;
      const event = d.care?.[p.pos];
      if (event && !event.applied && this.now() >= event.at) {
        event.applied = true;
        p[event.flag] = 1;
        p.reward_count = Math.floor(p.reward_count * 0.9);
      }
      p.is_can_reap = Number(
        this.now() >= mature &&
          (p.pos >= 1000 ||
            this.now() <= mature + Number(seed.Property1) * 60000) &&
          !p.is_worm &&
          !p.is_grass &&
          !p.is_ill &&
          !p.is_hunger &&
          !p.is_gloomy,
      );
    }
    const tree = f.tree_info;
    tree.left_time =
      id === this.userId
        ? Math.max(
            0,
            Math.ceil(((d.ownWaterAt ?? 0) + 600000 - this.now()) / 1000),
          )
        : 0;
    tree.left_pickTime =
      d.treePickedDay === day
        ? Math.ceil(
            (nextGameReset(this.now()) - this.now()) / 1000,
          )
        : 0;
    tree.property1 = f.gp;
    tree.property2 = f.grades;
  }
  private openSlots(f: Message, id: number): void {
    const crops = Math.min(18, 3 + Math.floor(f.grades / 5)),
      animals = Math.min(6, 3 + Math.floor(f.grades / 10));
    f.farmLandInfo ??= [];
    for (const pos of [
      ...Array.from({ length: crops }, (_, i) => i),
      ...Array.from({ length: animals }, (_, i) => i + 1000),
    ])
      if (!f.farmLandInfo.some((p: Message) => p.pos === pos))
        f.farmLandInfo.push(blank(id, pos));
  }
  private write(d: FarmSave): void {
    const stored = structuredClone(d);
    for (const plot of stored.model.farmLandInfo) {
      delete plot.op_type;
      delete plot.result;
    }
    this.store.db
      .prepare(
        "INSERT INTO local_farms(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state",
      )
      .run(d.model.user_id, JSON.stringify(stored));
  }
  synchronize(): void {
    const d = this.read();
    this.write(d);
    // The city save keeps only its own projection; friends are always read from their authoritative row.
    const own = structuredClone(d.model);
    own.user_id = this.uid;
    for (const p of own.farmLandInfo) p.user_id = this.uid;
    own.tree_info.userId = this.uid;
    this.saved.state.farms = { [this.uid]: own };
    this.saved.farmPlanted = d.planted;
  }
  query(id = this.userId): CityPacket[] {
    if (!this.social.canVisit(id))
      throw new FarmError(
        "Somente sua fazenda e fazendas de amigos locais podem ser visitadas",
      );
    const d = this.read(id);
    this.write(d);
    this.store.visitedFarms.set(this.userId, id);
    return [{ opcode: 4386, message: d.model }, ...this.friendStates([id])];
  }
  friendStates(ids = this.social.friends()): CityPacket[] {
    return [
      {
        opcode: 4190,
        message: {
          friendFarmState: ids
            .filter((id) => this.social.canVisit(id) && this.social.profile(id))
            .map((id) => {
              const d = this.read(id),
                f = d.model;
              return {
                user_id: id,
                is_reap: f.farmLandInfo.some(
                  (p: Message) =>
                    p.is_can_reap &&
                    !(p.stolenUsers ?? []).includes(this.userId) &&
                    p.stolen_count < 3,
                ),
                is_charge_energy:
                  d.treeWaterBy[this.userId] !== d.day &&
                  (id !== this.userId || f.tree_info.left_time === 0) &&
                  f.tree_info.waterCount <
                    Number(upgrade(7, f.grades)?.Data ?? 10),
                is_worm: f.farmLandInfo.some((p: Message) => p.is_worm),
                isGrass: f.farmLandInfo.some((p: Message) => p.is_grass),
                is_revive: f.farmLandInfo.some(
                  (p: Message) =>
                    p.item_template_id &&
                    p.pos < 1000 &&
                    this.now() >
                      time(p.mature_time) +
                        Number(
                          itemTemplate(p.item_template_id)?.Property1 ?? 0,
                        ) *
                          60000,
                ),
                is_feed_livestock: f.farmLandInfo.some(
                  (p: Message) => p.is_hunger,
                ),
                is_pacify: false,
                is_cure: false,
              };
            }),
        },
      },
    ];
  }
  private xp(d: FarmSave, amount: number, fromFriend = false): void {
    if (fromFriend) {
      amount = Math.min(
        amount,
        Math.max(
          0,
          configValue("Farm_TodayFromFriend_GP", 500) -
            d.model.today_from_friend_gp,
        ),
      );
      d.model.today_from_friend_gp += amount;
    }
    const max = Number(upgrade(17, d.model.grades + 1)?.Data ?? 0);
    if (d.model.grades >= this.saved.state.player.grades)
      amount = Math.min(amount, Math.max(0, max - d.model.gp));
    d.model.gp += amount;
    d.model.total_gp += amount;
    this.refresh(d, this.userId);
  }
  private reward(template: number, amount: number, reason: string): void {
    if (currencyAnnexes[template])
      this.ledger.change(
        this.saved.state,
        this.userId,
        currencyAnnexes[template]!,
        amount,
        reason,
      );
    else if (template === -200 || template === -700)
      grantExperience(this.saved.state.player, amount);
    else if (template > 0)
      this.inventory().add(
        {
          template_id: template,
          bag_type: 1,
          object_id: 0,
          bind: 1,
          exist: 1,
          used: 0,
          strengthen_grade: 0,
          join_1: -1,
          join_2: -1,
          join_3: -1,
          join_4: -1,
        },
        amount,
      );
    else throw new FarmError("Recompensa da semente não reconhecida");
  }
  private pushOwner(id: number, d: FarmSave, op: number): void {
    if (id === this.userId) return;
    queueLocalEvent(this.store, id, { opcode: 4387, message: d.model });
    if (op === 23)
      queueLocalEvent(this.store, id, {
        opcode: 147,
        message: { tree: [d.model.tree_info] },
      });
    const log = {
      player_id: id,
      oper_user_id: this.userId,
      oper_nick_name: this.social.profile(this.userId)!.nickname,
      desc:
        op === 14 ? "Colheita roubada por amigo" : "Fazenda ajudada por amigo",
      oper_date: date(this.now()),
      oper_count: 1,
      type: op,
    };
    d.logs.push(log);
    d.logs = d.logs.slice(-100);
    queueLocalEvent(this.store, id, { opcode: 145, message: log });
  }
  private publish(d: FarmSave): void {
    const owner = Number(d.model.user_id);
    for (const [visitor, selected] of this.store.visitedFarms) {
      if (
        selected !== owner ||
        visitor === this.userId ||
        visitor === owner ||
        !this.store.onlineUsers.has(visitor) ||
        !new SocialFeature(this.store, visitor).canVisit(owner)
      )
        continue;
      queueLocalEvent(this.store, visitor, { opcode: 4387, message: d.model });
      queueLocalEvent(this.store, visitor, {
        opcode: 147,
        message: { tree: [d.model.tree_info] },
      });
    }
  }
  tickPackets(): CityPacket[] {
    const d = this.read();
    this.write(d);
    this.publish(d);
    return [{ opcode: 4387, message: d.model }, ...this.friendStates()];
  }
  operate(r: Message): CityPacket[] {
    const id = Number(r.friend_id) || this.userId,
      op = Number(r.op_type);
    if (!this.social.canVisit(id))
      throw new FarmError("Amizade local necessária");
    if ([25,26].includes(op)) return this.quick(id, op === 26);
    if (op === 0 || op === 19) return this.query(id);
    const d = this.read(id),
      own = id === this.userId ? d : this.read(),
      f = d.model;
    const before = structuredClone(this.saved.state.items);
    if (op === 23) return this.water(id);
    if (op === 24) return this.pickTree();
    if (op === 11) {
      if (id !== this.userId || f.grades < 30 || f.land_grades >= 10)
        throw new FarmError(
          "Upgrade do solo: fazenda nível 30 e solo abaixo de 10",
        );
      const costs = String(
        tables.ConfigInfos!.find((x) => x.ConfigName === "FarmLand_Points")!
          .ConfigValue,
      )
        .split(",")
        .map(Number);
      this.ledger.change(
        this.saved.state,
        this.userId,
        r.pay_type === 0 ? "boundDiamonds" : "diamonds",
        -costs[f.land_grades - 1]!,
        "farm:land-upgrade",
      );
      f.land_grades++;
    } else if (op === 12) {
      if (id !== this.userId)
        throw new FarmError("Não pode ampliar outra fazenda");
      this.openSlots(f, id);
    } else {
      const positions = [Number(r.pos)];
      for (const pos of positions) {
        const p = f.farmLandInfo.find((p: Message) => p.pos === pos);
        if (!p)
          throw new FarmError(
            "Terreno ainda não liberado pelo nível da fazenda",
          );
        if (op === 1) {
          if (id !== this.userId || p.item_template_id)
            throw new FarmError("Plantio exige terreno próprio vazio");
          const seed = itemTemplate(Number(r.template_id));
          if (
            !seed ||
            ![216, 1500].includes(Number(seed.SonType)) ||
            Number(seed.NeedGrades) > f.grades ||
            !Number(seed.Property1)
          )
            throw new FarmError(
              "Semente inválida ou fazenda sem nível suficiente",
            );
          if (pos >= 1000 !== (Number(seed.SonType) === 1500))
            throw new FarmError(
              "Use o terreno adequado para essa semente/animal",
            );
          if (
            pos < 1000 &&
            Number(seed.Property5) > 0 &&
            f.farmLandInfo.some(
              (p: Message) =>
                p.item_template_id &&
                Number(itemTemplate(p.item_template_id)?.Property5) ===
                  Number(seed.Property5),
            )
          )
            throw new FarmError(
              "Só pode plantar uma semente especial dessa categoria por vez",
            );
          const stack = this.saved.state.items[`1:0:${r.bag_pos}`];
          if (!stack || stack.template_id !== Number(seed.TemplateId))
            throw new FarmError(
              "Semente não está no espaço informado da mochila",
            );
          this.inventory().consume(`1:0:${r.bag_pos}`, 1);
          const duration = Math.ceil(
            Number(seed.Property1) *
              60000 *
              (1 -
                (pos >= 1000 ? 0 :
                ((f.land_grades - 1) *
                  configValue("FarmCrop_Mature_Percent", 2))) /
                  100),
          );
          Object.assign(p, blank(id, pos), {
            item_template_id: Number(seed.TemplateId),
            add_time: date(this.now()),
            feed_time: date(this.now()),
            mature_time: date(this.now() + duration),
            reward_count: Math.floor(
              Number(seed.Property3) *
                (1 +
                  (pos >= 1000 ? 0 :
                  ((f.land_grades - 1) *
                    configValue("FarmCrop_Gains_Percent", 3))) /
                    100),
            ),
          });
          // Decide once and persist the care event; reconnecting never rerolls it.
          const thresholds = String(
            tables.ConfigInfos!.find(
              (c) => c.ConfigName === "farm_harmful_state_config",
            )!.ConfigValue,
          )
            .split("|")[0]!
            .split(",")
            .map(Number);
          const draw = randomInt(100),
            start = pos >= 1000 ? 2 : 0,
            flag =
              draw < Number(thresholds[start])
                ? pos >= 1000
                  ? "is_gloomy"
                  : "is_worm"
                : draw <
                    Number(thresholds[start]) + Number(thresholds[start + 1])
                  ? pos >= 1000
                    ? "is_ill"
                    : "is_grass"
                  : "";
          if (flag)
            (d.care ??= {})[pos] = {
              at: this.now() + Math.floor(duration / 2),
              flag,
              applied: false,
            };
          else delete d.care?.[pos];
          if (pos >= 1000) p.is_hunger = 1;
          d.planted++;
        } else if (op === 6 || op === 14) {
          if (!p.item_template_id || !p.is_can_reap)
            throw new FarmError("Plantação ainda não pode ser coletada");
          const seed = itemTemplate(p.item_template_id)!;
          if (op === 6 && id !== this.userId)
            throw new FarmError("Use roubar para colher na fazenda de amigos");
          let amount = Number(p.reward_count);
          if (op === 14) {
            if (
              id === this.userId ||
              own.model.today_stolen_count >=
                configValue("Farm_TodayStolen_Count", 200) ||
              p.stolen_count >= 3 ||
              (p.stolenUsers ?? []).includes(this.userId)
            )
              throw new FarmError(
                "Limite de roubo atingido para essa colheita",
              );
            amount = Math.max(1, Math.floor(Number(seed.Property3) * 0.1));
            amount = Math.min(amount, p.reward_count);
            p.reward_count -= amount;
            p.stolen_count++;
            (p.stolenUsers ??= []).push(this.userId);
            own.model.today_stolen_count++;
          }
          this.reward(
            Number(seed.Property2),
            amount,
            op === 14 ? "farm:steal" : "farm:harvest",
          );
          if (op === 6) {
            this.xp(own, Number(seed.Property4 ?? 0));
            if (pos >= 1000) {
              const special=d.specialDrops?.[pos]??0;if(special)this.reward(special,1,"farm:animal-special");delete d.specialDrops?.[pos];
              p.is_hunger = 1;
              p.is_can_reap = 0;
              p.reward_count = 0;
              p.stolenUsers = [];
              p.stolen_count = 0;
            } else Object.assign(p, blank(id, pos));
            delete d.care?.[pos];
          }
        } else if ([2, 3, 4, 5, 7].includes(op)) {
          const field = (
            {
              2: "is_worm",
              3: "is_grass",
              4: "is_gloomy",
              5: "is_ill",
              7: "is_hunger",
            } as Record<number, string>
          )[op]!;
          if (!p.item_template_id || !p[field])
            throw new FarmError("Nenhuma ação necessária nesse terreno");
          if (op === 7) {
            const seed = itemTemplate(p.item_template_id)!;
            if (
              id !== this.userId &&
              own.model.today_feed_count >=
                configValue("Farm_Today_HelpFeed_Count", 20)
            )
              throw new FarmError(
                "Limite diário de ajuda aos animais atingido",
              );
            this.inventory().consumeTemplate(
              Number(seed.Property6),
              Number(seed.Property7),
            );
            p.feed_time = date(this.now());
            p.mature_time = date(this.now() + Number(seed.Property1) * 60000);
            p.reward_count = Number(seed.Property3);
            (d.specialDrops??={})[pos]=randomInt(100)<residencePolicy.animalDropPercent?(residencePolicy.animalDrops[p.item_template_id]??0):0;
            if (id !== this.userId) own.model.today_feed_count++;
          }
          p[field] = 0;
          this.xp(
            own,
            configValue("FarmCrop_Operate_GP", 1),
            id !== this.userId,
          );
        } else if (op === 8) {
          if (
            !p.item_template_id ||
            p.pos >= 1000 ||
            this.now() <=
              time(p.mature_time) +
                Number(itemTemplate(p.item_template_id)!.Property1) * 60000
          )
            throw new FarmError("Plantação não precisa reviver");
          p.mature_time = date(this.now());
          this.xp(own, 1, id !== this.userId);
        } else if (op === 9) {
          if (
            id !== this.userId ||
            !p.item_template_id ||
            p.accelerate_count ||
            this.now() >= time(p.mature_time)
          )
            throw new FarmError("Aceleração indisponível");
          this.ledger.change(
            this.saved.state,
            this.userId,
            r.pay_type === 0 ? "boundDiamonds" : "diamonds",
            -configValue("Farm_Accelerate_Point", 10),
            "farm:accelerate",
          );
          p.mature_time = date(this.now());
          p.accelerate_count++;
        } else if (op === 10) {
          if (id !== this.userId)
            throw new FarmError("Não pode apagar plantação de amigo");
          Object.assign(p, blank(id, pos));
          delete d.care?.[pos];
        } else
          throw new FarmError("Operação básica da fazenda não reconhecida");
        p.op_type = op;
        p.result = 0;
      }
    }
    this.refresh(d, id);
    this.pushOwner(id, d, op);
    this.write(d);
    if (id !== this.userId) this.write(own);
    this.publish(d);
    this.synchronize();
    return [
      { opcode: 4387, message: d.model },
      { opcode: 4386, message: this.read().model },
      {
        opcode: 115,
        message: { moved: inventoryUpdates(before, this.saved.state.items) },
      },
      ...[3, 109, 112].map((opcode) => ({ opcode, message: {} })),
      ...this.friendStates([id]),
    ];
  }
  /** Native X-Clique sends only op 25/26 and owner, never a seed or a purchase. */
  private quick(id: number, animals: boolean): CityPacket[] {
    const before = structuredClone(this.saved.state.items);
    const positions = this.read(id).model.farmLandInfo.filter((p: Message) => !!p.item_template_id && (p.pos >= 1000) === animals).map((p: Message) => Number(p.pos)).sort((a: number,b: number) => a-b);
    for (const pos of positions) {
      for (const op of [2,3,4,5,7,8, id === this.userId ? 6 : 14]) {
        const p = this.read(id).model.farmLandInfo.find((p: Message) => p.pos === pos);
        if (!p?.item_template_id) break;
        const flag = ({2:"is_worm",3:"is_grass",4:"is_gloomy",5:"is_ill",7:"is_hunger"} as Record<number,string>)[op];
        const dead = p.pos < 1000 && this.now() > time(p.mature_time) + Number(itemTemplate(p.item_template_id)!.Property1) * 60000;
        if (flag ? !p[flag] : op === 8 ? !dead : !p.is_can_reap) continue;
        const previous = structuredClone(this.saved);
        this.store.db.exec("SAVEPOINT farm_quick_action");
        try {
          this.operate({ friend_id: id, op_type: op, pos });
          this.store.db.exec("RELEASE farm_quick_action");
        } catch (error) {
          this.store.db.exec("ROLLBACK TO farm_quick_action; RELEASE farm_quick_action");
          for (const key of Object.keys(this.saved)) delete (this.saved as any)[key];
          Object.assign(this.saved, previous);
          if (!(error instanceof FarmError || error instanceof InventoryError || error instanceof CurrencyError)) throw error;
        }
      }
    }
    this.synchronize();
    return [...this.query(id), { opcode: 115, message: { moved: inventoryUpdates(before, this.saved.state.items) } },
      ...[3,109,112].map(opcode => ({opcode,message:{}}))];
  }
  water(id = this.userId): CityPacket[] {
    if (!this.social.canVisit(id))
      throw new FarmError("Amizade necessária para energizar esta árvore");
    const d = this.read(id),
      own = id === this.userId ? d : this.read(),
      t = d.model.tree_info;
    if (
      this.saved.state.player.grades < 11 ||
      t.fruitCount > 0 ||
      (d.treeWaterBy[this.userId] === d.day && id !== this.userId) ||
      (id === this.userId && t.left_time > 0) ||
      t.waterCount >= Number(upgrade(7, d.model.grades)?.Data ?? 10)
    )
      throw new FarmError("Árvore sem energização disponível");
    t.waterCount++;
    t.lastWaterTime = date(this.now());
    if (id === this.userId) d.ownWaterAt = this.now();
    d.treeWaterBy[this.userId] = d.day;
    this.xp(own, 1, id !== this.userId);
    if (t.waterCount >= Number(upgrade(7, d.model.grades)?.Data ?? 10)) {
      t.fruitCount = 1;
      t.nextPickTime = date(this.now());
    }
    this.pushOwner(id, d, 23);
    this.write(d);
    if (id !== this.userId) this.write(own);
    this.publish(d);
    this.synchronize();
    return [
      { opcode: 147, message: { tree: [this.read(id).model.tree_info] } },
      {
        opcode: 146,
        message: {
          tree: [this.read(id).model.tree_info],
          harvestMsg: ["Energia da árvore +1"],
        },
      },
      { opcode: 4386, message: this.read().model },
      ...this.friendStates([id]),
    ];
  }
  pickTree(): CityPacket[] {
    const d = this.read(),
      t = d.model.tree_info;
    if (!t.fruitCount || t.left_pickTime > 0)
      throw new FarmError("Árvore sem frutos disponíveis");
    // The base fruit XP table (18) is retained separately from farm XP (17).
    const xp = Number(upgrade(18, d.model.grades)?.Data ?? 0);
    if (xp) grantExperience(this.saved.state.player, xp);
    this.xp(d, 1);
    t.fruitCount = 0;
    d.treePickedDay = d.day;
    this.write(d);
    this.publish(d);
    this.synchronize();
    return [
      {
        opcode: 106,
        message: {
          tree: [this.read().model.tree_info],
          pickMsg: [
            `Experiência +${xp}`,
            "Experiência da fazenda +1",
            "Fruto coletado",
          ],
        },
      },
      { opcode: 147, message: { tree: [this.read().model.tree_info] } },
      { opcode: 4386, message: this.read().model },
      { opcode: 3, message: {} },
    ];
  }
  buy(r: Message): CityPacket[] | undefined {
    const b = r.buyInfo,
      offer = tables.ShopTempInfos!.find(
        (x) => Number(x.Id) === Number(b?.good_id),
      );
    if (!offer || Number(offer.ShopType) !== 6) return;
    const count = Number(b.count),
      seed = itemTemplate(Number(offer.ItemId)),
      farm = this.read();
    if (
      !seed ||
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      count > 9999 ||
      (b.receive_id &&
        b.receive_id !== this.uid &&
        b.receive_id !== this.userId) ||
      Number(seed.NeedGrades) > farm.model.grades ||
      Number(offer.NeedGrades) > farm.model.grades
    )
      throw new FarmError("Compra de semente inválida ou sem nível suficiente");
    const before = structuredClone(this.saved.state.items),
      cost: Partial<Record<Currency, number>> = {};
    for (const [field, currency] of [
      ["Gold", "gold"],
      ["Point", "diamonds"],
      ["GiftToken", "boundDiamonds"],
      ["MazeCoin", "labyrinthCoin"],
    ] as const)
      if (Number(offer[field])) cost[currency] = -Number(offer[field]) * count;
    if (!Object.keys(cost).length)
      throw new FarmError("Oferta sem custo recuperado");
    this.ledger.changeMany(
      this.saved.state,
      this.userId,
      cost,
      `farm:seed-shop:${offer.Id}`,
    );
    this.inventory().add(
      {
        template_id: Number(offer.ItemId),
        exist: 1,
        bag_type: 1,
        object_id: 0,
        bind: 1,
        used: 0,
        strengthen_grade: 0,
        join_1: -1,
        join_2: -1,
        join_3: -1,
        join_4: -1,
      },
      count,
    );
    return [
      { opcode: 90, message: { buyInfo: { ...b, result: 1 } } },
      {
        opcode: 115,
        message: { moved: inventoryUpdates(before, this.saved.state.items) },
      },
      { opcode: 109, message: {} },
      { opcode: 3, message: {} },
    ];
  }
  buyCart(r:Message):CityPacket[]|undefined {
    const entries=r.carItemInfo??[],offer=(id:number)=>tables.ShopTempInfos!.find(x=>Number(x.Id)===id&&Number(x.ShopType)===6);
    if(!entries.some((e:Message)=>offer(Number(e.shopId))))return;
    if(!entries.length||entries.length>100||entries.some((e:Message)=>!offer(Number(e.shopId))||Number(e.isDiscountShop)!==0)||Number(r.discountTempId??0)!==0)throw new FarmError("Carrinho de fazenda inválido.");
    const before=structuredClone(this.saved.state.items);
    for(const e of entries)this.buy({buyInfo:{good_id:Number(e.shopId),count:Number(e.counts),receive_id:Number(r.receiveUserId??0)}});
    return [{opcode:4783,message:{result:0,receiveUserId:r.receiveUserId??this.userId,discountTempId:0,carItemInfo:entries}},
      {opcode:115,message:{moved:inventoryUpdates(before,this.saved.state.items)}},{opcode:109,message:{}},{opcode:3,message:{}}];
  }
  initialPackets(): CityPacket[] {
    this.synchronize();
    return [
      {
        opcode: 4157,
        message: {
          farm: this.read().model,
          friendFarmState: this.friendStates()[0]!.message!.friendFarmState,
        },
      },
      { opcode: 4146, message: { treeInfo: [this.read().model.tree_info] } },
    ];
  }
  handle(op: number, r: Message): CityPacket[] | undefined {
    if (op === 15044)
      return this.operate({
        ...r,
        friend_id: r.friend_id === this.uid ? this.userId : r.friend_id,
      });
    if (op === 8231)
      return this.friendStates(
        (r.friendId ?? this.social.friends()).map((id: number) =>
          id === this.uid ? this.userId : id,
        ),
      );
    if (op === 8219)
      return [
        {
          opcode: 4146,
          message: {
            treeInfo: (r.friendId ?? [this.userId])
              .map((id: number) => (id === this.uid ? this.userId : id))
              .filter((id: number) => this.social.canVisit(id))
              .map((id: number) => this.read(id).model.tree_info),
          },
        },
      ];
    if (op === 15017)
      return this.water(
        !r.user_id || r.user_id === this.uid ? this.userId : r.user_id,
      );
    if (op === 5178) return this.pickTree();
    if (op === 5154) return this.buy(r);
    if (op === 8970) return this.buyCart(r);
    return;
  }
}
