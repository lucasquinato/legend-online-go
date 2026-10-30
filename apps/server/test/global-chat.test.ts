import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { GlobalChat } from "../src/features/messaging/global-chat.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { frame } from "../src/protocol.js";
import type { TutorialResponse } from "../src/tutorial.js";
const schema = typeName("chat.ChatChannelMsg");
test("global usa o título atual validado pelo servidor e ignora o título enviado pelo cliente",()=>{
 const s=setup();try{
  let selected=26;
  s.attach(1901,()=>selected);s.attach(1902);
  s.send(1901,"Com título",10,15005,{appellid:999999});
  assert.equal(s.rows(1902)[0]!.message.appellid,26);
  selected=0;s.advance(2000);s.send(1901,"Sem título",10,15005,{appellid:26});
  assert.equal(s.rows(1902)[1]!.message.appellid,0);
 }finally{s.cleanup();}
});
function setup() {
  mkdirSync(join(projectRoot,".test-data"),{recursive:true});
  const dir=mkdtempSync(join(projectRoot,".test-data","global-chat-"));
  const store=new Store(dir);let now=100000;
  for(const [id,icon] of [[1901,3],[1902,5],[1903,1]]) {
    store.initTutorialProfile(id!);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname=? WHERE user_id=?").run(icon!,`Pirata${id}`,id!);
  }
  const hub=new GlobalChat(store,()=>now), inbox=new Map<number,TutorialResponse[]>();
  const attach=(id:number,title?:()=>number)=>{const rows:TutorialResponse[]=[];inbox.set(id,rows);return hub.attach(id,p=>rows.push(...p),title);};
  const send=(id:number,text:string,channel=10,opcode=15005,extra:Record<string,unknown>={})=>hub.handle(id,frame(opcode,id,encodeMessage(schema,{channel,encode_msg:text,...extra}),777));
  const rows=(id:number)=>inbox.get(id)!.map(p=>{const b=Buffer.from(p.frame,"base64");return {opcode:b.readUInt16BE(6),recipient:b.readInt32BE(8),message:decodeMessage(schema,b.subarray(20))};});
  return {store,hub,attach,send,rows,advance:(ms:number)=>{now+=ms;},cleanup(){store.close();rmSync(dir,{recursive:true,force:true});}};
}
test("global entrega uma vez a todos os conectados, incluindo remetente, com identidade do servidor e classes distintas",()=>{
 const s=setup();try{
  s.attach(1901);s.attach(1902);s.attach(1903);
  s.send(1901,"Olá, piratas!",10,15005,{other_id:1902,name:"Administrador",job:1,user_type:99,is_centerTip:true,is_bigTip:true,channel:10,team:[1901]});
  for(const id of [1901,1902,1903]){
   const [row]=s.rows(id);assert.equal(s.rows(id).length,1);assert.equal(row!.opcode,83);assert.equal(row!.recipient,id);
   assert.equal(row!.message.channel,10);assert.equal(row!.message.other_id,1901);assert.equal(row!.message.name,"Pirata1901");
   assert.equal(row!.message.job,0);assert.equal(row!.message.user_type,0);assert.equal(row!.message.is_centerTip,0);assert.equal(row!.message.is_bigTip,0);
   assert.equal(row!.message.encode_msg,"Olá, piratas!");assert.equal(row!.message.team,undefined);
  }
 }finally{s.cleanup();}
});
test("8198 é global gratuito, não concede nem consome recursos e não aceita metadados de item forjados",()=>{
 const s=setup();try{
  s.attach(1901);s.attach(1902);const before=s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions").get()!.n;
  s.send(1901,"Bom dia",0,8198,{items:[{template_id:2030102,count:9999}],stars:[{id:999}],powcards:[]});
  assert.equal(s.rows(1902)[0]!.message.channel,10);assert.equal(s.rows(1902)[0]!.message.items,undefined);
  assert.equal(s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions").get()!.n,before);
 }finally{s.cleanup();}
});
test("canais de sistema, equipe, guilda, atual e privado não podem ser publicados pelo jogador",()=>{
 const s=setup();try{
  s.attach(1901);s.attach(1902);
  for(const channel of [0,1,2,3,5,6,7,8,11,12,14,20,999]){s.send(1901,"Não transmitir",channel);s.advance(2000);}
  assert.equal(s.rows(1902).length,0);assert.ok(s.rows(1901).every(p=>p.message.channel===3));
 }finally{s.cleanup();}
});
test("mensagens inválidas e excesso de frequência não vazam; cooldown expira e não bloqueia outra conta",()=>{
 const s=setup();try{
  s.attach(1901);s.attach(1902);
  for(const text of ["","  ","x".repeat(85),"a\nb","a\u0000b"]){s.send(1901,text);s.advance(2000);}
  assert.equal(s.rows(1902).length,0);
  s.send(1901,"primeira");s.send(1901,"bloqueada");s.send(1902,"segunda conta");
  assert.deepEqual(s.rows(1902).map(p=>p.message.encode_msg),["primeira","segunda conta"]);
  s.advance(2000);s.send(1901,"liberada");assert.equal(s.rows(1902).at(-1)!.message.encode_msg,"liberada");
 }finally{s.cleanup();}
});
test("desconectados não recebem fila; reconectar não reenvia global antigo nem remove a nova sessão por token antigo",()=>{
 const s=setup();try{
  s.attach(1901);const old=s.attach(1902);old();s.send(1901,"antiga");
  assert.equal(s.rows(1902).length,0);s.attach(1902);old();assert.equal(s.rows(1902).length,0);
  s.advance(2000);s.send(1901,"nova");assert.deepEqual(s.rows(1902).map(p=>p.message.encode_msg),["nova"]);
 }finally{s.cleanup();}
});
test("markup do usuário é texto, não links nem instruções de sistema; pacotes malformados geram erro apenas local",()=>{
 const s=setup();try{
  s.attach(1901);s.attach(1902);s.send(1901,'Olá <a t="1">amigo</a> & adeus');
  assert.equal(s.rows(1902)[0]!.message.encode_msg,'Olá &lt;a t="1"&gt;amigo&lt;/a&gt; &amp; adeus');
  s.hub.handle(1901,frame(8198,1901,Buffer.from([0xff])));
  assert.equal(s.rows(1902).length,1);assert.equal(s.rows(1901).at(-1)!.message.channel,3);
 }finally{s.cleanup();}
});
