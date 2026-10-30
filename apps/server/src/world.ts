import { synchronizedTime } from "./game-clock.js";
import { automaticModeMessage, setBattleAutomatic } from "./features/battle/automatic.js";
import { tutorialEngine } from "./combat.js";
import { type Store } from "./store.js";
import { type TutorialScenario, type TutorialResponse } from "./tutorial.js";
import { fields, frame } from "./protocol.js";
import {
  decodeMessage,
  encodeMessage,
  typeName,
  PACKET_MESSAGES,
  type Message,
} from "./messages.js";
import {
  createBattle,
  advanceBattle,
  selectSkill,
  classForIcon,
  skillsFor,
  heroStats,
  tutorialGrade,
  migrateBattleBalance,
  readyTutorialBattle,
  setTutorialPaused,
  type Battle,
  type BattleEvent,
} from "./combat.js";
import { CityWorld, hasCity } from "./city-world.js";
import { closingDelay } from "./features/battle/timing.js";
import { starterTemplate } from "./starter-equipment.js";
import { rollInitialEquipment, initialEquipmentIds } from "./features/attributes/initial-equipment.js";
import { RejectionFeedback } from "./features/messaging/index.js";
import {
  buildingAt,
  buildingTemplates,
} from "./features/settlement/content.js";

export interface WorldState {
  version: 1;
  wins: number[];
  process: number;
  cityEntered: boolean;
  complete: boolean;
  battle?: Battle;
  position?: { x: number; y: number };
  rewardCount: number;
  initialEquipment?: Record<string, Message>;
}
export class TutorialWorld {
  private readonly rejectionFeedback: RejectionFeedback;
  private readonly existingWorld: boolean;
  private cityInstance?: CityWorld;
  city(): CityWorld | undefined {
    if (!this.state.complete || !hasCity(this.store)) return undefined;
    return (this.cityInstance ??= new CityWorld(
      this.store,
      this.userId,
      this.now,
    ));
  }
  readonly state: WorldState;
  private readonly encounters: {
    step: number;
    prepare: Message;
    finishStep: number;
  }[];
  constructor(
    readonly store: Store,
    readonly scenario: TutorialScenario,
    readonly userId: number,
    private now: () => number = Date.now,
  ) {
    this.rejectionFeedback = new RejectionFeedback(userId, now);
    const saved = store.db
      .prepare("SELECT state FROM tutorial_worlds WHERE user_id=?")
      .get(userId);
    const profile = store.tutorialProfile(userId);
    this.state =
      saved && profile?.active
        ? JSON.parse(String(saved.state))
        : {
            version: 1,
            wins: [],
            process: Math.min(profile?.process ?? 0, 11500),
            cityEntered: false,
            complete: false,
            rewardCount: 0,
          };
    this.existingWorld = !!(saved && profile?.active);
    this.encounters = [];
    scenario.steps.forEach((s, index) => {
      const response = s.responses.find(
        (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 157,
      );
      if (!response) return;
      const prepare = decodeMessage(
        typeName("battle.BattlePrepareMsg"),
        Buffer.from(response.frame, "base64").subarray(20),
      );
      const finishStep = scenario.steps.findIndex((step) => {
        const request = Buffer.from(step.request, "base64");
        return (
          request.readUInt16BE(6) === 10008 &&
          fields(request.subarray(20)).some(
            (f) =>
              Buffer.isBuffer(f.value) &&
              f.value.toString() === prepare.battle_id,
          ) &&
          step.responses.some(
            (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 154,
          )
        );
      });
      if (finishStep < 0)
        throw new Error("Encontro sem encerramento de referência");
      this.encounters.push({ step: index, prepare, finishStep });
    });
    if (this.encounters.length !== 3)
      throw new Error(
        "O tutorial dinâmico requer os três encontros capturados",
      );
    if (this.state.battle && profile?.icon)
      migrateBattleBalance(this.state.battle, profile.icon, this.initialEquipment());
    // Reconnection starts the remaining fight from its persisted life and resource state.
    if (this.state.battle && !this.state.battle.finished) {
      this.state.battle.ready = false;
      this.state.battle.paused = false;
      this.state.battle.nextTurnAt = 0;
      this.state.battle.started = false;
      this.state.battle.frame = 27;
    }
  }
  save(): void {
    if (this.cityInstance) {
      this.cityInstance.persist();
      this.state.process = this.cityInstance.state.player.novice_process;
    }
    this.store.db
      .prepare(
        "INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state",
      )
      .run(this.userId, JSON.stringify(this.state));
    this.store.db
      .prepare("UPDATE tutorial_profiles SET process=? WHERE user_id=?")
      .run(this.state.process, this.userId);
  }
  private profile() {
    const p = this.store.tutorialProfile(this.userId);
    if (!p?.active || !classForIcon(p.icon))
      throw new Error("Crie o personagem antes de jogar");
    return p;
  }
  private initialEquipment(): Message[] {
    const job = classForIcon(this.profile().icon);
    if (!this.state.initialEquipment) {
      this.state.initialEquipment = {};
      for (const template of [[1011003,1012003,1013003][job-1]!,[1041003,1042003,1043003][job-1]!]) {
        const item: Message = { template_id: template };
        if (this.existingWorld) {
          const ids = template < 1040000 ? [70102,70904,70402] : [70605,71106,70502];
          for (let n=1;n<=5;n++) item[`random_skill_${n}`] = ids[n-1] ?? 0;
        } else rollInitialEquipment(item);
        this.state.initialEquipment[template] = item;
      }
      this.save();
    }
    return Object.values(this.state.initialEquipment);
  }
  private packet(
    opcode: number,
    name: string,
    message: Message,
    delayMs = 0,
  ): TutorialResponse {
    return {
      frame: frame(
        opcode,
        this.userId,
        encodeMessage(typeName(name), message),
      ).toString("base64"),
      delayMs,
    };
  }
  private personalize(name: string, message: Message): Message {
    if(name===typeName("player.SynchronizedTimeMsg"))return synchronizedTime(this.now());
    const p = this.profile();
    const job = classForIcon(p.icon);
    const grade = tutorialGrade(this.state.wins, this.state.cityEntered);
    const equipment = this.initialEquipment(), stats = heroStats(p.icon, grade, equipment);
    const visit = (type: string, m: Message) => {
      if ("template_id" in m && "bag_type" in m) {
        m.template_id = starterTemplate(m.template_id, job);
        if (initialEquipmentIds.has(m.template_id)) {
          const own = equipment.find(i => i.template_id === m.template_id)!;
          for (let n=1;n<=5;n++) m[`random_skill_${n}`] = own[`random_skill_${n}`];
        }
      }
      if (
        "building_id" in m &&
        "son_type" in m &&
        Number(buildingTemplates.get(Number(m.template_id))?.MasterType) < 13
      ) {
        const row = buildingAt(Number(m.son_type), grade);
        if (row) m.template_id = Number(row.TemplateId);
      }
      for (const [key, value] of Object.entries(m)) {
        if (
          typeof value === "object" &&
          value !== null &&
          !value.bytes &&
          !value.integer &&
          !("wire" in value)
        ) {
          if (Array.isArray(value))
            value.forEach((x) => {
              if (typeof x === "object") visit("", x);
            });
          else visit("", value);
        }
        if (
          [
            "player_id",
            "user_id",
            "hero_id",
            "army_id",
            "object_id",
            "change_obj_id",
          ].includes(key) &&
          value === this.scenario.userId
        )
          m[key] = this.userId;
        if (
          ["map_id", "room_id"].includes(key) &&
          value === 100000000 + this.scenario.userId
        )
          m[key] = 100000000 + this.userId;
        if (
          ["nick_name", "name", "nickName"].includes(key) &&
          value === this.scenario.registration.nickname
        )
          m[key] = p.nickname;
        if (
          [
            "template_id",
            "tempate_id",
            "hero_tempId",
            "head_id",
            "pic",
            "user_pics",
          ].includes(key) &&
          value === this.scenario.registration.icon
        )
          m[key] = p.icon;
        if (key === "skill_script" && typeof value === "string")
          m[key] =
            [
              ...skillsFor(p.icon, 0),
              ...(grade >= 10 && job === 3 ? [30111, 30211] : []),
              ...(grade >= 10 ? skillsFor(p.icon, 2).slice(2) : []),
            ].join(",") + ",";
        if (key === "fast_key")
          m[key] =
            skillsFor(p.icon, grade >= 10 ? 2 : 0)
              .map((id) => Math.floor(id / 100))
              .join(",") + ",";
      }
      if (type.endsWith("PlayerMsg")) {
        m.player_id = this.userId;
        m.nick_name = p.nickname;
        m.sex = p.sex;
        m.pic = p.icon;
        m.job = p.icon;
        m.novice_process = this.state.process;
        m.grades = grade;
        m.fighting_capacity = stats.capacity;
      }
      if ("hero_tempId" in m && "job" in m) {
        m.hero_tempId = p.icon;
        m.job = job;
        m.grades = grade;
        if ("fightingCapacity" in m) m.fightingCapacity = stats.capacity;
      }
      if (m.player_id === this.userId && "grades" in m) m.grades = grade;
      if (m.army_id === this.userId && this.state.position) {
        if ("cur_pos_x" in m) m.cur_pos_x = this.state.position.x;
        if ("cur_pos_y" in m) m.cur_pos_y = this.state.position.y;
      }
      if (
        "skill_script" in m &&
        "total_magic_attack" in m &&
        m.player_id === this.userId
      ) {
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
        for (const key of attributes) {
          m[`base_${key}`] = stats.base[key];
          m[`total_${key}`] = stats.total[key];
        }
        const battle = this.state.battle;
        const battleGrade = battle
          ? battle.encounter === 2
            ? 10
            : battle.encounter + 1
          : 0;
        m.grade = grade;
        m.hp =
          battle && battleGrade === grade
            ? Math.min(
                stats.live,
                battle.fighters.find((f) => f.id === battle.hero)!.hp,
              )
            : stats.live;
        m.fighting_capacity = stats.capacity;
        // Preserve the original distinction between base and total attributes.
        for (const key of Object.keys(m))
          if (/^(base|total)_(strength|tenacity|penetrate|stunAttr)$/.test(key))
            m[key] = 0;
      }
    };
    visit(name, message);
    return message;
  }
  private templates(
    index: number,
    filter: (op: number) => boolean = () => true,
  ): TutorialResponse[] {
    return (this.scenario.steps[index]?.responses ?? [])
      .filter((r) => filter(Buffer.from(r.frame, "base64").readUInt16BE(6)))
      .map((r, i) => {
        const p = Buffer.from(r.frame, "base64"),
          op = p.readUInt16BE(6),
          name = op === 4130 ? typeName("building.BuildingInfoListMsg") : PACKET_MESSAGES[op];
        const body = name
          ? encodeMessage(
              name,
              this.personalize(name, decodeMessage(name, p.subarray(20))),
            )
          : p.subarray(20);
        return {
          frame: frame(
            op,
            this.userId,
            body,
            p.readInt32BE(12),
            p.readInt32BE(16),
          ).toString("base64"),
          delayMs: 30 + i * 2,
        };
      });
  }
  bootstrap(): TutorialResponse[] {
    const city = this.city();
    if (city) return city.bootstrap();
    const result = this.templates(11);
    const latest = this.state.complete
      ? this.encounters[2]!.finishStep
      : this.state.cityEntered
        ? 59
        : this.state.wins.includes(1)
          ? this.encounters[1]!.finishStep
          : this.state.wins.includes(0)
            ? this.encounters[0]!.finishStep
            : 11;
    const updates = this.templates(latest, (op) =>
      [3, 100, 113, 140, 150].includes(op),
    );
    result.push(...updates.map((r, i) => ({ ...r, delayMs: 250 + i * 2 })));
    if (this.state.battle && !this.state.battle.finished)
      result.push(this.resumePrepare(600));
    return result;
  }
  login(): TutorialResponse[] {
    const city = this.city();
    if (city) return city.login();
    return this.scenario.login.map((r, i) => {
      const p = Buffer.from(r.frame, "base64"),
        op = p.readUInt16BE(6),
        name = PACKET_MESSAGES[op];
      const body = name
        ? encodeMessage(
            name,
            this.personalize(name, decodeMessage(name, p.subarray(20))),
          )
        : p.subarray(20);
      return {
        frame: frame(
          op,
          this.userId,
          body,
          p.readInt32BE(12),
          p.readInt32BE(16),
        ).toString("base64"),
        delayMs: i * 2,
      };
    });
  }
  private resumePrepare(delayMs = 0): TutorialResponse {
    const b = this.state.battle!,
      prepare = structuredClone(b.prepare);
    for (const h of [...(prepare.heros ?? []), ...(prepare.soldiers ?? [])]) {
      const f = b.fighters.find((f) => f.id === h.living_id)!;
      h.hp = f.hp;
      h.init_hp = f.hp;
      if (h.living_id === b.hero) h.sp = b.sp;
    }
    prepare.coolDown = b.skills.map((id) => ({
      templated_id: id,
      cool_down: Math.max(0, (b.cooldowns[id] ?? 0) - this.now()),
      cool_type: 1,
      appear_cool_down: 0,
    }));
    return this.packet(157, "battle.BattlePrepareMsg", prepare, delayMs);
  }
  start(encounter: number): TutorialResponse[] {
    const p = this.profile();
    if (this.state.battle && !this.state.battle.finished)
      return [this.resumePrepare()];
    if (this.state.wins.includes(encounter)) return [];
    if (encounter > 0 && !this.state.wins.includes(encounter - 1))
      return this.reject("Conclua o encontro anterior");
    if (encounter === 2 && !this.state.cityEntered)
      return this.reject("Entre na cidade primeiro");
    this.state.battle = createBattle(
      this.encounters[encounter]!.prepare,
      encounter,
      p.icon,
      this.userId,
      p.nickname,
      this.initialEquipment(),
    );
    this.save();
    return [
      ...this.templates(
        this.encounters[encounter]!.step,
        (op) => ![157, 4234, 109].includes(op),
      ),
      this.resumePrepare(100),
    ];
  }
  private reject(reason: string, notify = true): TutorialResponse[] {
    this.store.tutorialEvent("world-rejected", this.userId, { reason });
    return notify ? this.rejectionFeedback.prepare(reason)
      .map(packet => this.packet(packet.opcode, "chat.ChatChannelMsg", packet.message!)) : [];
  }
  setProgress(process: number): boolean {
    const city = this.city();
    if (city) return city.setProgress(process);
    if (
      !Number.isInteger(process) ||
      process % 100 ||
      process < 0 ||
      process > 19500
    )
      return false;
    if (process > 11500 && !this.state.wins.includes(0)) return false;
    if (process >= 14000 && !this.state.wins.includes(1)) return false;
    if (process === 19500 && !this.state.battle && !this.state.complete)
      return false;
    this.state.process = Math.max(this.state.process, process);
    this.save();
    return true;
  }
  handle(packet: Buffer): TutorialResponse[] {
    const op = packet.readUInt16BE(6),
      list = fields(packet.subarray(20));
    const num = (n: number) =>
      Number(list.find((f) => f.number === n && f.wire === 0)?.value ?? 0);
    const str = (n: number) => {
      const v = list.find((f) => f.number === n && f.wire === 2)?.value;
      return Buffer.isBuffer(v) ? v.toString() : "";
    };
    const city = this.city();
    if (city && op !== 20008) return city.handle(packet);
    if (op === 8271) return this.bootstrap();
    if (op === 5124) {
      const points = list.filter(
        (f) => f.number === 3 && Buffer.isBuffer(f.value),
      );
      const last = points.at(-1)?.value;
      if (Buffer.isBuffer(last)) {
        const coordinates = fields(last);
        const x = Number(coordinates.find((f) => f.number === 1)?.value),
          y = Number(coordinates.find((f) => f.number === 2)?.value);
        if ([x, y].every((v) => Number.isInteger(v) && v >= 0 && v < 100000)) {
          this.state.position = {
            x: Math.floor(x / 20),
            y: Math.floor(y / 20),
          };
          this.save();
        }
      }
      return [];
    }
    if (op === 5032 && num(2) === 1000206) return this.start(0);
    if (op === 5125) {
      const node = num(1);
      if (node === 1000208) return this.start(1);
      if (node === 1000206) return this.templates(23);
      if (node === 1000210 && this.state.wins.includes(1))
        return this.templates(56);
      return node === 1000211
        ? []
        : this.reject("Interação fora do trecho implementado");
    }
    if (op === 5025) {
      if (!this.state.wins.includes(1))
        return this.reject("O mapa ainda não foi concluído");
      if (this.state.cityEntered) return [];
      this.state.cityEntered = true;
      this.state.process = Math.max(19000, this.state.process);
      this.save();
      return this.templates(59);
    }
    if (op === 8699) return this.start(2);
    if (op === 5017) {
      if (!this.setProgress(num(1)))
        return this.reject("Marco ainda não liberado", false);
      // Dialogue and transition packets belong to objectives, independent of click order.
      const i =
        num(1) === 19500
          ? 64
          : num(1) === 19000 && this.state.cityEntered
            ? 59
            : num(1) === 14000
              ? 49
              : num(1) === 11400
                ? 21
                : num(1) === 11500
                  ? 22
                  : -1;
      return i >= 0
        ? this.templates(i, (op) => i !== 59 || ![22, 4165].includes(op))
        : [];
    }
    const b = this.state.battle;
    if (op === 10007) {
      if (!b || b.finished) return [];
      if (str(2) !== b.id) return [this.resumePrepare()];
      readyTutorialBattle(b, this.now());
      this.save();
      return [];
    }
    if (op === 10020) {
      if (!b||b.finished||str(2)!==b.id||![1,2].includes(num(5))||(num(1)&&num(1)!==this.userId)) return [];
      const engine=tutorialEngine(b);
      if(!setBattleAutomatic(engine,b.hero,num(5)===1,this.now()))return [];
      b.autoBattle=num(5)===1;b.prepare.attack_model=num(5);this.save();
      return [this.packet(77,"battle.AttackModeMsg",automaticModeMessage(engine,b.hero,this.userId,b.id))];
    }
    if (op === 10008) {
      const response = b
        ? selectSkill(b, str(1), num(2), num(3), this.now())
        : {
            opcode: 75,
            message: {
              battle_id: str(1),
              hero_index_id: num(2),
              skill_id: num(3),
              result: 1,
            },
            delayMs: 0,
          };
      this.save();
      return [
        this.packet(response.opcode, "battle.HeroOrderMsg", response.message),
      ];
    }
    if (op === 10010 || op === 10022) {
      if (!b || str(2) !== b.id || b.finished) return [];
      setTutorialPaused(b,op===10010,this.now());
      this.save();
      return op === 10010
        ? [this.packet(69, "battle.UserStopMsg", { type: 1, order: 0 })]
        : [];
    }
    if (op === 20008)
      return this.packetList([
        { opcode: 4234, message: { time: "" }, delayMs: 0 },
      ]);
    if (
      [
        20010, 5020, 8224, 8586, 5012, 15029, 9606, 8218, 8209, 8747,
      ].includes(op)
    )
      return [];
    if (op === 5035) {
      // UI state changes do not mutate encounters or issue rewards.
      if (num(2) === 4 && !this.state.cityEntered)
        return this.templates(this.state.wins.includes(0) ? 33 : 15);
      return [];
    }
    if (op === 5015 || op === 15013)
      return this.templates(
        this.state.complete ? 71 : 11,
        (code) => code === (op === 5015 ? 109 : 85),
      );
    if (op === 8281 && this.state.complete) return this.templates(71);
    const template = this.scenario.steps.findIndex(
      (s) => Buffer.from(s.request, "base64").readUInt16BE(6) === op,
    );
    if (
      template >= 0 &&
      [8530, 8625, 9635, 9624, 8322, 5127, 9550, 8516, 5019].includes(op)
    )
      return this.templates(template);
    return this.reject(`Comando ${op} ainda não implementado`, false);
  }
  private packetList(events: BattleEvent[]): TutorialResponse[] {
    return events.map((e) =>
      e.opcode === 4234
        ? this.packet(
            4234,
            "player.SynchronizedTimeMsg",
            synchronizedTime(this.now()),
            e.delayMs,
          )
        : this.packet(
            e.opcode,
            PACKET_MESSAGES[e.opcode]!.replace("com.road.yishi.proto.", ""),
            e.message,
            e.delayMs,
          ),
    );
  }
  tick(): TutorialResponse[] {
    const city = this.city();
    if (city) return city.tick();
    const b = this.state.battle;
    if (!b) return [];
    const previousFrame = b.frame;
    const events = advanceBattle(b, this.now());
    if (!events.length) {
      if (b.frame !== previousFrame) this.save();
      return [];
    }
    const result = this.packetList(events);
    const endDelay = closingDelay(events.find(e => e.opcode === 154)?.delayMs ?? 0);
    if (b.finished) {
      if (b.won) {
        if (!this.state.wins.includes(b.encounter)) {
          this.state.wins.push(b.encounter);
          this.state.rewardCount++;
          if (b.encounter === 2) {
            this.state.complete = true;
            this.state.process = 19500;
          }
          this.store.tutorialEvent("world-victory", this.userId, {
            encounter: b.encounter,
            turns: b.turn,
            hp: b.fighters.find((f) => f.id === b.hero)!.hp,
            complete: this.state.complete,
          });
        }
        result.push(
          ...this.templates(
            this.encounters[b.encounter]!.finishStep,
            (op) => ![75, 153, 154].includes(op),
          ).map((r, i) => ({ ...r, delayMs: endDelay + i * 2 })),
        );
      } else {
        this.store.tutorialEvent("world-defeat", this.userId, {
          encounter: b.encounter,
        });
        // Return the local army to idle without issuing the victory rewards.
        result.push(
          ...this.templates(
            this.encounters[b.encounter]!.finishStep,
            (op) => op === 140,
          ).map((r) => ({ ...r, delayMs: endDelay })),
        );
      }
    }
    this.save();
    return result;
  }
}
