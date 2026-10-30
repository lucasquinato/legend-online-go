import type { Store } from '../../store.js';
import type { Message } from '../../messages.js';
export const defaultReplies:Record<number,string>={4:'Estou ausente. Responderei quando voltar.',6:'Estou ocupado no momento. Responderei assim que possível.',5:'Não perturbe: responderei mais tarde.'};
const initialized=new WeakSet<Store>();
export function ensureSocialState(store:Store):void{if(initialized.has(store))return;store.db.exec(`
 CREATE TABLE IF NOT EXISTS social_presence(user_id INTEGER PRIMARY KEY,last_online INTEGER NOT NULL DEFAULT 0,last_offline INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS social_im_state(user_id INTEGER PRIMARY KEY,state INTEGER NOT NULL DEFAULT 7,replies TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS social_im_history(id INTEGER PRIMARY KEY AUTOINCREMENT,sender INTEGER NOT NULL,recipient INTEGER NOT NULL,message TEXT NOT NULL,sent_at TEXT NOT NULL,automatic INTEGER NOT NULL DEFAULT 0,delivered INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS social_im_pending ON social_im_history(recipient,delivered,id);
 CREATE TABLE IF NOT EXISTS social_blocks(owner_id INTEGER NOT NULL,target_id INTEGER NOT NULL,PRIMARY KEY(owner_id,target_id));
 CREATE TABLE IF NOT EXISTS social_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id INTEGER NOT NULL,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS social_friend_groups(owner_id INTEGER NOT NULL,friend_id INTEGER NOT NULL,group_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner_id,friend_id));`);store.db.exec("UPDATE social_friend_groups SET group_id=2 WHERE group_id=0");initialized.add(store);}
export function imState(store:Store,uid:number):{state:number;replies:Record<number,string>}{const row=store.db.prepare('SELECT * FROM social_im_state WHERE user_id=?').get(uid);return {state:Number(row?.state??7),replies:row?JSON.parse(String(row.replies)): {}};}
export function socialPresence(store:Store,uid:number):number{return store.onlineUsers.has(uid)?imState(store,uid).state:0;}
export function blocked(store:Store,a:number,b:number):boolean{return !!store.db.prepare('SELECT 1 FROM social_blocks WHERE (owner_id=? AND target_id=?) OR (owner_id=? AND target_id=?)').get(a,b,b,a);}
export function conversation(store:Store,uid:number,other:number,before=Number.MAX_SAFE_INTEGER,limit=100):Message[]{return store.db.prepare('SELECT * FROM social_im_history WHERE id<? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) ORDER BY id DESC LIMIT ?').all(before,uid,other,other,uid,Math.min(200,Math.max(1,limit)));}
