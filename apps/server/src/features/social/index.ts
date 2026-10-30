import { teams } from "./teams.js";
import { nativePacket } from "./protocol.js";
import { ensureSocialState, socialPresence, blocked } from "./state.js";
import type { Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import type { Store } from "../../store.js";
import { classForIcon } from "../../combat.js";

export const SOCIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS local_friends(owner_id INTEGER NOT NULL,friend_id INTEGER NOT NULL,PRIMARY KEY(owner_id,friend_id));
CREATE TABLE IF NOT EXISTS friend_requests(sender_id INTEGER NOT NULL,recipient_id INTEGER NOT NULL,PRIMARY KEY(sender_id,recipient_id));
CREATE TABLE IF NOT EXISTS local_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,packet TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS local_events_owner ON local_events(user_id,seq);`;
export class SocialError extends Error {}
export function queueLocalEvent(
  store: Store,
  userId: number,
  packet: CityPacket,
): void {
  store.db
    .prepare("INSERT INTO local_events(user_id,packet) VALUES(?,?)")
    .run(userId, JSON.stringify(packet));
}
export class SocialFeature {
  constructor(
    private store: Store,
    private userId: number,
  ) { ensureSocialState(store); }
  profiles(): Message[] {
    return this.store.db
      .prepare(
        "SELECT p.* FROM tutorial_profiles p JOIN users u ON u.id=p.user_id WHERE p.active=1 AND p.nickname<>''",
      )
      .all() as Message[];
  }
  profile(id: number): Message | undefined {
    return (
      this.profiles().find((p) => p.user_id === id) ??
      (id === this.userId ? this.store.tutorialProfile(id) : undefined)
    );
  }
  friends(): number[] {
    return this.store.db
      .prepare(
        "SELECT f.friend_id FROM local_friends f JOIN users u ON u.id=f.friend_id WHERE f.owner_id=? ORDER BY f.friend_id",
      )
      .all(this.userId)
      .map((r) => Number(r.friend_id));
  }
  canVisit(id: number): boolean {
    return id === this.userId || (this.friends().includes(id) && !blocked(this.store,this.userId,id));
  }
  info(id: number): Message {
    const p = this.profile(id);
    if (!p) throw new SocialError("Personagem local inexistente");
    const row = this.store.db
        .prepare("SELECT state FROM city_worlds WHERE user_id=?")
        .get(id),
      state = row ? JSON.parse(String(row.state)).state : undefined;
    return {
      user_id: id,
      nick_name: p.nickname,
      relation: 1,
      sex: p.sex,
      pic: p.icon,
      grades: state?.player.grades ?? 1,
      job: classForIcon(p.icon),
      fight_capacity: state?.hero.fighting_capacity ?? 0,
      online_state: this.store.onlineUsers.has(id)?1:0,
      chat_state: socialPresence(this.store,id),
      relation_grade: 1,
      relation_gp: 0,
      group_id: Number(this.store.db.prepare("SELECT group_id FROM social_friend_groups WHERE owner_id=? AND friend_id=?").get(this.userId,id)?.group_id??2),
      result: 1,
    };
  }
  list(): Message[] {
    return this.friends()
      .filter((id) => this.profile(id) && !blocked(this.store,this.userId,id))
      .map((id) => this.info(id)).concat(this.store.db.prepare("SELECT target_id FROM social_blocks WHERE owner_id=?").all(this.userId).filter(r=>this.profile(Number(r.target_id))).map(r=>({...this.info(Number(r.target_id)),relation:2})));
  }
  requests(): CityPacket[] {
    return this.store.db
      .prepare("SELECT sender_id FROM friend_requests WHERE recipient_id=?")
      .all(this.userId)
      .filter((r) => this.profile(Number(r.sender_id)))
      .map((r) => ({
        opcode: 84,
        message: {
          other_id: Number(r.sender_id),
          nick_name: this.profile(Number(r.sender_id))!.nickname,
          relation: 1,
          result: 1,
          notice_msg: "Solicitação de amizade local",
        },
      }));
  }
  clean(): void {
    this.store.db.exec(
      "DELETE FROM local_friends WHERE owner_id NOT IN (SELECT id FROM users) OR friend_id NOT IN (SELECT id FROM users); DELETE FROM friend_requests WHERE sender_id NOT IN (SELECT id FROM users) OR recipient_id NOT IN (SELECT id FROM users); DELETE FROM local_events WHERE user_id NOT IN (SELECT id FROM users)",
    );
  }
  groups():Message[]{return this.store.db.prepare("SELECT id group_id,name group_name FROM social_groups WHERE owner_id=? ORDER BY id").all(this.userId);}
  initial():CityPacket[]{return this.groups().map(g=>nativePacket(4227,"simple.FriendGroupMsg",{...g,result:1}));}
  handle(op: number, r: Message): CityPacket[] | undefined {
    if([15025,15026,15027,15028].includes(op)){
      const group=Number(r.group_id),name=String(r.group_name??"").trim();
      if(op===15025||op===15027){if(!name||name.length>30||/[\u0000-\u001f]/.test(name))throw new SocialError("Nome do grupo inválido");}
      if(op===15025){if(this.groups().length>=20)throw new SocialError("Limite de grupos atingido");const id=Number(this.store.db.prepare("SELECT MAX(9,COALESCE(MAX(id),9))+1 id FROM social_groups").get()!.id);this.store.db.prepare("INSERT INTO social_groups(id,owner_id,name) VALUES(?,?,?)").run(id,this.userId,name);return[nativePacket(4227,"simple.FriendGroupMsg",{group_id:id,group_name:name,result:1})];}
      if(!this.groups().some(g=>g.group_id===group)&&!(op===15028&&group===2))throw new SocialError("Grupo inexistente");
      if(op===15028){const other=Number(r.firend_id);if(!this.friends().includes(other))throw new SocialError("Amigo inexistente");this.store.db.prepare("INSERT INTO social_friend_groups VALUES(?,?,?) ON CONFLICT(owner_id,friend_id) DO UPDATE SET group_id=excluded.group_id").run(this.userId,other,group);return[nativePacket(4230,"friend.MoveFriendReqMsg",{firend_id:other,group_id:group,result:1})];}
      if(op===15026){this.store.db.prepare("DELETE FROM social_groups WHERE id=? AND owner_id=?").run(group,this.userId);this.store.db.prepare("UPDATE social_friend_groups SET group_id=2 WHERE owner_id=? AND group_id=?").run(this.userId,group);}else this.store.db.prepare("UPDATE social_groups SET name=? WHERE id=? AND owner_id=?").run(name,group,this.userId);
      return[nativePacket(op===15026?4228:4229,"simple.FriendGroupMsg",{group_id:group,group_name:name,result:1})];
    }
    if(op===15043)return[nativePacket(4272,"chat.ChatStateListRspMsg",{chatState:(r.user_id??[]).slice(0,200).map((id:number)=>({user_id:id,chat_state:socialPresence(this.store,id),result:1}))})];
    if (op === 15013) {
      const players = this.profiles()
        .filter((p) => p.user_id !== this.userId)
        .map((p) => {
          const i = this.info(p.user_id);
          return {
            player_id: p.user_id,
            nick_name: p.nickname,
            level: i.grades,
            sex: p.sex,
            attack: i.fight_capacity,
            job: i.job,
            map_name: "Cidade local",
          };
        });
      return [
        {
          opcode: 85,
          message: {
            girlList: players.filter((p) => p.sex === 1),
            boyList: players.filter((p) => p.sex === 0),
          },
        },
      ];
    }
    if (op === 15042)
      return [
        {
          opcode: 4273,
          message: {
            total_rows: Math.max(0, this.profiles().length - 1),
            snsInfo: this.profiles()
              .filter((p) => p.user_id !== this.userId)
              .map((p) => ({
                user_id: p.user_id,
                nickname: p.nickname,
                sex: p.sex,
                head_id: p.icon,
                job: classForIcon(p.icon),
              })),
          },
        },
      ];
    if (![15003, 15004, 15012].includes(op)) return;
    const other =
      Number(r.other_id) ||
      this.profiles().find((p) => p.nickname === r.nick_name)?.user_id;
    if (!other || other === this.userId || !this.profile(other))
      throw new SocialError(
        "Amizades exigem outro personagem existente neste servidor",
      );
    if (op === 15004) {
      this.store.db.prepare("DELETE FROM social_friend_groups WHERE (owner_id=? AND friend_id=?) OR (owner_id=? AND friend_id=?)").run(this.userId,other,other,this.userId);
      const wasBlock=this.store.db.prepare("DELETE FROM social_blocks WHERE owner_id=? AND target_id=?").run(this.userId,other);
      if(wasBlock.changes)return [{opcode:79,message:{other_id:other,result:1}}];
      this.store.db
        .prepare(
          "DELETE FROM local_friends WHERE (owner_id=? AND friend_id=?) OR (owner_id=? AND friend_id=?)",
        )
        .run(this.userId, other, other, this.userId);
      this.store.db
        .prepare(
          "DELETE FROM friend_requests WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)",
        )
        .run(this.userId, other, other, this.userId);
      queueLocalEvent(this.store, other, {
        opcode: 79,
        message: { other_id: this.userId, result: 1 },
      });
      return [{ opcode: 79, message: { other_id: other, result: 1 } }];
    }
    if (op === 15003 && Number(r.relation)===2) {
      this.store.db.prepare("INSERT OR IGNORE INTO social_blocks VALUES(?,?)").run(this.userId,other);
      return [{opcode:78,message:{...this.info(other),relation:2}}];
    }
    if (op === 15003 && blocked(this.store,this.userId,other)) throw new SocialError("A relação está bloqueada na lista negra");
    if (op === 15003 && r.relation !== 1)
      throw new SocialError("Relação não suportada");
    const incoming = this.store.db
      .prepare(
        "SELECT 1 FROM friend_requests WHERE sender_id=? AND recipient_id=?",
      )
      .get(other, this.userId);
    if (incoming) {
      for (const [a, b] of [
        [this.userId, other],
        [other, this.userId],
      ])
        this.store.db
          .prepare(
            "INSERT OR IGNORE INTO local_friends(owner_id,friend_id) VALUES(?,?)",
          )
          .run(a!, b!);
      this.store.db
        .prepare(
          "DELETE FROM friend_requests WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)",
        )
        .run(this.userId, other, other, this.userId);
      queueLocalEvent(this.store, other, {
        opcode: 78,
        message: new SocialFeature(this.store, other).info(this.userId),
      });
      return [{ opcode: 78, message: this.info(other) }];
    }
    if (op === 15012)
      throw new SocialError("Solicitação de amizade inexistente");
    if (this.friends().includes(other))
      return [{ opcode: 78, message: this.info(other) }];
    const result = this.store.db
      .prepare(
        "INSERT OR IGNORE INTO friend_requests(sender_id,recipient_id) VALUES(?,?)",
      )
      .run(this.userId, other);
    if (result.changes)
      queueLocalEvent(this.store, other, {
        opcode: 84,
        message: {
          other_id: this.userId,
          nick_name: this.profile(this.userId)!.nickname,
          relation: 1,
          result: 1,
          notice_msg: "Solicitação de amizade local",
        },
      });
    return [];
  }
  drain(): CityPacket[] {
    const rows = this.store.db
      .prepare(
        "SELECT seq,packet FROM local_events WHERE user_id=? ORDER BY seq LIMIT 100",
      )
      .all(this.userId);
    if (rows.length)
      this.store.db
        .prepare("DELETE FROM local_events WHERE user_id=? AND seq<=?")
        .run(this.userId, Number(rows.at(-1)!.seq));
    return rows.map((r) => JSON.parse(String(r.packet)));
  }
  hasEvents(): boolean {
    return !!this.store.db
      .prepare("SELECT 1 FROM local_events WHERE user_id=? LIMIT 1")
      .get(this.userId);
  }
}
export function localPresence(
  store: Store,
  userId: number,
  online: boolean,
): void {
  ensureSocialState(store);
  store.db.prepare(online?"INSERT INTO social_presence(user_id,last_online) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_online=excluded.last_online":"INSERT INTO social_presence(user_id,last_offline) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_offline=excluded.last_offline").run(userId,Date.now());
  if (online) store.onlineUsers.add(userId);
  else {
    store.onlineUsers.delete(userId);
    store.visitedFarms.delete(userId);
  }
  teams(store).sync(userId);
  for (const r of store.db
    .prepare("SELECT owner_id FROM local_friends WHERE friend_id=?")
    .all(userId))
    queueLocalEvent(store, Number(r.owner_id), {
      opcode: online ? 160 : 161,
      message: { other_id: userId, result: 1 },
    });
}
