import type { Store } from "../../store.js";
import { decodeMessage, encodeMessage, typeName, type Message } from "../../messages.js";
import { frame } from "../../protocol.js";
import type { TutorialResponse } from "../../tutorial.js";
import { RejectionFeedback } from "./rejections.js";
import { ensureSocialState, imState, defaultReplies, blocked } from "../social/state.js";
import {weddingHub} from "../social/wedding.js";
import { residenceHub } from "../residence/hub.js";
import { teams } from "../social/teams.js";
import { skyHub } from "../sky-realm/hub.js";

const schema = typeName("chat.ChatChannelMsg");
type Session = { deliver: (packets: TutorialResponse[]) => void; errors: RejectionFeedback; title: () => number };
export const globalChatChannel = 10;
export const globalChatMaxLength = 84;
export const globalChatIntervalMs = 2000;

/** One hub per GameServer. Global is ephemeral, authenticated and independent of scenes. */
export class GlobalChat {
  private readonly sessions = new Map<number, Session>();
  private readonly lastSent = new Map<number, number>();
  constructor(private readonly store: Store, private readonly now = Date.now) { ensureSocialState(store); }
  ready(uid:number):void { this.restore(uid); }
  private automaticAt = new Map<string,number>();
  private emit(uid:number,opcode:number,schemaName:string,message:Message):void { this.sessions.get(uid)?.deliver([{frame:frame(opcode,uid,encodeMessage(typeName(schemaName),message)).toString("base64"),delayMs:0}]); }
  private savedMessage(row:Message):Message {return {from_id:Number(row.sender),from_nick:this.store.tutorialProfile(Number(row.sender))?.nickname??"Jogador",to_id:Number(row.recipient),encode_msg:String(row.message),send_date:String(row.sent_at),result:1};}
  private restore(uid:number):void { if(!this.sessions.has(uid))return;const status=imState(this.store,uid);for(const state of [...[4,5,6,7].filter(n=>n!==status.state),status.state])this.emit(uid,4232,"chat.ChatStateMsg",{user_id:uid,chat_state:state,replay_str:status.replies[state]??defaultReplies[state]??"",result:1});for(const row of this.store.db.prepare("SELECT * FROM social_im_history WHERE recipient=? AND delivered=0 ORDER BY id LIMIT 500").all(uid)){if(blocked(this.store,uid,Number(row.sender))){this.store.db.prepare("UPDATE social_im_history SET delivered=2 WHERE id=?").run(row.id!);continue;}this.emit(uid,4231,"im.ChatFriendMsg",this.savedMessage(row));this.store.db.prepare("UPDATE social_im_history SET delivered=1 WHERE id=?").run(row.id!);} }
  private changeState(uid:number,packet:Buffer):boolean {const schemaName="chat.ChatStateMsg";let r:Message;try{r=decodeMessage(typeName(schemaName),packet.subarray(20));}catch{return true;}const state=Number(r.chat_state),text=String(r.replay_str??"").trim();if(![4,5,6,7].includes(state)||text.length>200||/[\u0000-\u001f\u007f]/u.test(text)){this.emit(uid,4232,schemaName,{user_id:uid,result:-1});return true;}const current=imState(this.store,uid);current.state=state;if(state!==7)current.replies[state]=text||defaultReplies[state]!;this.store.db.prepare("INSERT INTO social_im_state VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,replies=excluded.replies").run(uid,state,JSON.stringify(current.replies));const message={user_id:uid,chat_state:state,replay_str:current.replies[state]??"",result:1};this.emit(uid,4232,schemaName,message);for(const row of this.store.db.prepare("SELECT owner_id FROM local_friends WHERE friend_id=?").all(uid))this.emit(Number(row.owner_id),4232,schemaName,message);return true;}

  attach(userId: number, deliver: Session["deliver"], title: () => number = () => 0): () => void {
    const session = { deliver, errors: new RejectionFeedback(userId, this.now), title };
    this.sessions.set(userId, session);

    return () => { if (this.sessions.get(userId) === session) this.sessions.delete(userId); };
  }

  handle(userId: number, packet: Buffer): boolean {
    const opcode = packet.readUInt16BE(6);
    if([15029,15023].includes(opcode)&&!this.sessions.has(userId))return true;
    if (opcode === 15029) return this.changeState(userId,packet);
    if (opcode === 15023) return this.privateMessage(userId, packet);
    if (opcode !== 15005 && opcode !== 8198) return false;
    const session = this.sessions.get(userId);
    if (!session) return true;
    const reject = (reason: string) => session.deliver(session.errors.prepare(reason, "chat:send").map(p => ({
      frame: frame(p.opcode, userId, encodeMessage(schema, p.message!)).toString("base64"), delayMs: 0,
    })));
    let request: Message;
    try {
      if (packet.length > 4096) throw new Error("Oversized chat");
      request = decodeMessage(schema, packet.subarray(20));
    } catch { reject("Mensagem de chat inválida."); return true; }
    const realm = skyHub(this.store), channel = opcode === 8198 ? globalChatChannel : Number(request.channel);
    const wedding=weddingHub(this.store),weddingOwner=wedding.members.get(userId)?.owner,house=residenceHub(this.store),houseOwner=house.members.get(userId)?.owner,teamMembers=teams(this.store).members(userId);
    const realmChannel = channel === 20 || (channel === 8 && (realm.members.has(userId)||houseOwner!==undefined||weddingOwner!==undefined)) || (channel===6&&teamMembers.length>0);
    if (opcode === 15005 && request.channel !== globalChatChannel && !realmChannel) {
      reject("Selecione um canal disponível: Global, Local, Equipe ou Privado.");
      return true;
    }
    const text = typeof request.encode_msg === "string" ? request.encode_msg.trim() : "";
    if (!text || text.length > globalChatMaxLength || /[\u0000-\u001f\u007f]/u.test(text)) {
      reject(`Escreva uma mensagem de 1 a ${globalChatMaxLength} caracteres, em uma única linha.`);
      return true;
    }
    const profile = this.store.tutorialProfile(userId);
    if (!profile?.active || !profile.nickname) { reject("Crie seu personagem antes de usar o chat global."); return true; }
    const target = channel === 20 ? Number(request.other_id) : undefined;
    if (channel === 20 && (!target || target === userId || !this.sessions.has(target) || blocked(this.store,userId,target))) {
      reject("O destinatário não está disponível."); return true;
    }
    const now = this.now();
    for (const [id, at] of this.lastSent) if (now < at || now - at >= globalChatIntervalMs) this.lastSent.delete(id);
    if (this.lastSent.has(userId)) { reject("Aguarde 2 segundos para enviar outra mensagem global."); return true; }
    // No client-supplied sender, role, job, recipients, links or item metadata is trusted.
    const message = {
      channel, type: 0, other_id: userId, name: profile.nickname,
      encode_msg: text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!),
      job: 0, user_type: 0, vip_grade: 0, is_centerTip: false, is_bigTip: false,
      appellid: session.title(),
      ...(channel === 20 ? { receive_name: this.store.tutorialProfile(target!)!.nickname } : {}),
    };
    const body = encodeMessage(schema, message);
    if(channel===20)this.store.db.prepare("INSERT INTO social_im_history(sender,recipient,message,sent_at,automatic,delivered) VALUES(?,?,?,?,0,1)").run(userId,target!,message.encode_msg,new Date(now).toISOString().slice(0,19).replace("T"," "));
    this.lastSent.set(userId, now);
    for (const [recipient, peer] of this.sessions) {
      if(channel===8 && (weddingOwner!==undefined?wedding.members.get(recipient)?.owner!==weddingOwner:houseOwner!==undefined?house.members.get(recipient)?.owner!==houseOwner:!realm.members.has(recipient)))continue;
      if(channel===6&&!teamMembers.includes(recipient))continue;
      if (channel === 20 && recipient !== userId && recipient !== target) continue;
      peer.deliver([{
      frame: frame(83, recipient, body, packet.readInt32BE(12)).toString("base64"), delayMs: 0,
      }]);
    }
    if(channel===20)this.automaticReply(userId,target!,now);
    return true;
  }
  private automaticReply(userId:number,target:number,now:number):void {
    const state=imState(this.store,target),key=target+":"+userId,previous=this.automaticAt.get(key);
    if(this.sessions.has(target)&&state.state!==7&&(previous===undefined||now<previous||now-previous>=60000)){const reply=state.replies[state.state]??defaultReplies[state.state];if(reply){const text="[Resposta automática] "+reply.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]!),date=new Date(now).toISOString().slice(0,19).replace("T"," ");this.store.db.prepare("INSERT INTO social_im_history(sender,recipient,message,sent_at,automatic,delivered) VALUES(?,?,?,?,1,1)").run(target,userId,text,date);this.emit(userId,4231,"im.ChatFriendMsg",{from_id:target,from_nick:this.store.tutorialProfile(target)!.nickname,to_id:userId,encode_msg:text,send_date:date,result:1});this.automaticAt.set(key,now);}}
  }
  /** Native private-window protocol used by IMManager.sendIMMsg, distinct from channel chat. */
  private privateMessage(userId: number, packet: Buffer): boolean {
    const sender = this.sessions.get(userId); if (!sender) return true;
    const imSchema = typeName("im.ChatFriendMsg"); let request: Message = {};
    const ack = (result: number, message: Message = {}) => sender.deliver([{
      frame: frame(4236, userId, encodeMessage(imSchema, { from_id: userId, to_id: Number(request.to_id ?? 0), result, ...message })).toString("base64"), delayMs: 0,
    }]);
    try { if (packet.length > 4096) throw Error(); request = decodeMessage(imSchema, packet.subarray(20)); }
    catch { ack(-1); return true; }
    const target = Number(request.to_id), recipient = this.sessions.get(target);
    const text = typeof request.encode_msg === "string" ? request.encode_msg.trim() : "", profile = this.store.tutorialProfile(userId);
    const now = this.now(), previous = this.lastSent.get(userId);
    if (!Number.isSafeInteger(target) || !this.store.tutorialProfile(target)?.active || blocked(this.store,userId,target) || target === userId || !profile?.nickname ||
        !text || text.length > 200 || /[\u0000-\u001f\u007f]/u.test(text) || (previous !== undefined && now >= previous && now - previous < globalChatIntervalMs)) {
      ack(-1); return true;
    }
    const message = { from_id: userId, from_nick: profile.nickname, to_id: target,
      encode_msg: text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!),
      send_date: new Date(now).toISOString().slice(0, 19).replace("T", " "), result: 1 };
    const insert=this.store.db.prepare("INSERT INTO social_im_history(sender,recipient,message,sent_at,automatic,delivered) VALUES(?,?,?,?,?,?)");
    insert.run(userId,target,message.encode_msg,message.send_date,0,recipient?1:0);
    this.lastSent.set(userId, now); ack(1, message);
    if(recipient)this.emit(target,4231,"im.ChatFriendMsg",message);
    this.automaticReply(userId,target,now);
    return true;
  }
}
