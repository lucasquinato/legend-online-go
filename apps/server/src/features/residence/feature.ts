import { spouse } from "../social/marriage.js";
import { nativePacket } from "../social/protocol.js";
import { residenceHub } from "./hub.js";
import { saveResidenceLayout } from "./layout.js";
import type { CitySave } from "../../city-world.js";
import type { Store } from "../../store.js";
import type { CityPacket } from "../../city-state.js";
import { type Message,decodeMessage,encodeMessage,typeName } from "../../messages.js";

import { residencePolicy } from "./policy.js";
import { collectResidence,changeFurniture,settleResidence,ResidenceError } from "./economy.js";
import { furniture, furnitureOffers } from "../navigation/content.js";
import type { CurrencyLedger } from "../currencies/index.js";
import { SocialFeature } from "../social/index.js";
interface Context {readonly saved:CitySave;store:Store;userId:number;uid:number;ledger:CurrencyLedger;now():number;persist():void;atomic<T>(fn:()=>T):T;room():Message;notice(text:string):CityPacket[]}
const home=(message:Message):CityPacket=>({opcode:4753,body:encodeMessage(typeName("children.HomeMsg"),message).toString("base64")});
export class ResidenceFeature {
 constructor(private c:Context){}
 initialPackets():CityPacket[]{return this.active?[]:[this.snapshot(false,this.c.userId)];}
 reconnect():CityPacket[]{const packets=this.scene();this.join();return packets;}
 private get hub(){return residenceHub(this.c.store);}
 private room():Message{const p=this.c.store.tutorialProfile(this.c.userId)!,{army,hero,player}=this.c.saved.state;return{player_id:this.c.userId,army_id:this.c.userId,hero_id:this.c.userId,nick_name:p.nickname,template_id:p.icon,head_id:p.icon,sex:p.sex,grades:player.grades,fighting_capacity:hero.fighting_capacity,campaign_id:5601,cur_pos_x:army.cur_pos_x,cur_pos_y:army.cur_pos_y,online_state:1,army_state:0,arm:army.arm??"",cloth:army.cloth??"",wing:army.wing??"",hat:army.hat??"",hide:army.hide??0,fashion_arm:army.fashion_arm??"",fashion_cloth:army.fashion_cloth??"",mount_tempId:army.mount_tempId??0,mount_grade:army.mount_grade??0,appellid:player.appell_id??0};}
 private join(){this.hub.join({uid:this.c.userId,owner:this.owner,room:()=>this.room()});}
 disconnect(){this.hub.leave(this.c.userId);}
 tick():CityPacket[]{if(!this.active){this.disconnect();return [];}this.hub.refresh(this.c.userId);return this.hub.drain(this.c.userId);}
 get active():boolean{return this.c.saved.map===5601;}
 private get save(){return this.c.saved.residence!;}
 private get owner():number{return this.active?((this.c.saved as CitySave & {residenceOwner?:number}).residenceOwner??this.c.userId):this.c.userId;}
 private snapshot(refresh=false,owner=this.owner):CityPacket {
  const s=owner===this.c.userId?this.save:JSON.parse(String(this.c.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(owner)!.state)).residence;
  const profile=this.c.store.tutorialProfile(owner)!;
  return home({home_id:s.owned?owner:0,userId_a:owner,userId_b:spouse(this.c.store,owner),tar_user_id:owner,cour_userid:owner,house_userid:owner,cour_nickname:profile.nickname,house_nickname:profile.nickname,courtyardGarde:s.courtyardLevel??1,houseGrade:s.owned?(s.houseLevel??1):0,state:Number(s.owned),furniture:Object.values(s.layout??{}),courFurniture:[],is_refresh:Number(refresh),cleanness:s.cleanliness??100,is_big_bonfire:0,maidExpireDate:s.maidAt?new Date(s.maidAt).toISOString().slice(0,19).replace("T"," "):"",today_bonfire_count:0,showMount:[],leftTime:0,beginLeftTime:0});
 }
 private initialize():void {
  this.save.layout??={};this.save.nextId??=1;this.save.houseLevel??=1;this.save.courtyardLevel??=1;
  if(!Object.keys(this.save.layout).length)for(const templateId of [101002,202001]){const id=this.save.nextId++;this.save.layout[id]={id,templateId,pos_x:0,pos_y:0,rotation:0};this.save.furniture[templateId]=(this.save.furniture[templateId]??0)+1;}
 }
 private spawn(){const owner=this.owner===this.c.userId?this.save:JSON.parse(String(this.c.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(this.owner)!.state)).residence;return (owner.houseLevel??1)>=2?{cur_pos_x:40,cur_pos_y:35}:{cur_pos_x:25,cur_pos_y:36};}
 private scene():CityPacket[]{
  const spawn={cur_pos_x:this.c.saved.state.army.cur_pos_x,cur_pos_y:this.c.saved.state.army.cur_pos_y};const room={result:1,player:[this.room(),...this.hub.peers(this.c.userId,this.owner)]};
  return [this.snapshot(),{opcode:4165,message:{army_id:this.c.uid}},{opcode:125,message:{created_type:1,room:{room_id:this.owner,campaignId:5601,master_id:this.owner,name:"Residência",count:room.player.length,capacity:100}}},
   {opcode:127,message:{node:[]}},nativePacket(21,"room.RoomEnterMsg",room),{opcode:131,message:{army_id:this.c.uid,player_id:this.c.uid,...spawn,state:0}}];
 }
 handle(opcode:number,body:Buffer):CityPacket[]|undefined {
  if(this.active&&opcode===5124){const r=decodeMessage(typeName("worldmap.PosMoveMsg"),body),routes=r.routes??[];
   if(![this.c.userId,this.c.uid].includes(Number(r.army_id))||Number(r.map_id)!==5601||!routes.length||routes.length>2048||routes.some((p:Message)=>![p.x,p.y].every(n=>Number.isInteger(n)&&n>=0&&n<1200)))throw new ResidenceError("Trajeto inválido.");
   this.c.atomic(()=>{const last=routes.at(-1);Object.assign(this.c.saved.state.army,{cur_pos_x:Math.floor(last.x/20),cur_pos_y:Math.floor(last.y/20)});this.c.persist();});
   this.hub.broadcast(this.c.userId,{opcode:4185,message:{map_id:5601,army_id:this.c.userId,userId:[this.c.userId],routes,army_state:0}});return [];
  }
  if(this.active&&[5035,5004].includes(opcode))return[];
  // enterOver sends 5038 after RoomCreated has already started this scene.
  // Repeating 125 here restarts the loader and recursively emits another 5038.
  if(this.active&&opcode===5038)return [];
  if(opcode!==8873&&opcode!==9519)return;
  if(Number(this.c.saved.state.player.grades)<residencePolicy.unlockLevel)throw new ResidenceError("A Residência é liberada junto da Fazenda, no nível 11.");
  let r=decodeMessage(typeName(opcode===9519?"children.FurnitureShopBuyMsg":"children.ChildrenOpMsg"),body);
  if(opcode===9519){const offer=furnitureOffers.find(o=>Number(o.Id)===Number(r.shopId));if(!offer||!Number.isSafeInteger(r.count)||r.count<1||r.count>999)throw new ResidenceError("Oferta ou quantidade inválida.");r={op_type:2,property1:Number(offer.SellFurnitureId),pay_type:1,quantity:Number(r.count)*Number(offer.SellFurnitureCount)};}
  const op=Number(r.op_type);
  const packets=this.c.atomic(()=>{
   const requested=Number(r.property1||this.c.userId),target=[this.c.uid,this.c.userId].includes(requested)?this.c.userId:requested;
   if(op===1005&&target===this.c.userId){this.c.persist();return[this.snapshot(false,target)];}
   if([1001,1002,1003,1005].includes(op)){
    if(target!==this.c.userId){const social=new SocialFeature(this.c.store,this.c.userId),row=this.c.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(target);if((!social.canVisit(target)&&spouse(this.c.store,this.c.userId)!==target)||!row||!JSON.parse(String(row.state)).residence?.owned)throw new ResidenceError("Esta residência não está disponível para visita.");}
    else if(!this.save.owned){this.c.ledger.change(this.c.saved.state,this.c.userId,"gold",-residencePolicy.unlockGold,"residence:unlock");this.save.owned=true;this.save.lastAt=this.c.now();this.save.productiveMs=0;this.save.accrued=0;this.initialize();}
    if(op===1005){this.c.persist();return[this.snapshot(false,target)];}
    if(this.c.saved.battle&&!this.c.saved.battle.finished)throw new ResidenceError("Conclua a batalha antes de entrar na Residência.");
    (this.c.saved as CitySave & {residenceOwner?:number}).residenceOwner=target;
    this.c.saved.map=5601;delete this.c.saved.instanceFury;Object.assign(this.c.saved.state.army,{map_id:5601,...this.spawn(),state:0});
    const packets=this.scene();this.c.saved.location=packets;this.c.persist();return [...packets,{opcode:109,message:{}}];
   }
   if(!this.save.owned||this.owner!==this.c.userId)throw new ResidenceError("Somente o dono pode modificar ou coletar nesta residência.");
   this.initialize();settleResidence(this.save,this.c.now());const notices:CityPacket[]=[];
   if(op===2){const row=furniture.find(t=>Number(t.TemplateId)===Number(r.property1));if(!row)throw new ResidenceError("Móvel inexistente.");if(Number(row.Grade)>Number(this.save.houseLevel))throw new ResidenceError("Eleve a residência para adquirir este móvel.");const count=Number(r.quantity??1);if(!Number.isSafeInteger(count)||count<1||count>999)throw new ResidenceError("Quantidade de móveis inválida.");this.c.ledger.change(this.c.saved.state,this.c.userId,Number(r.pay_type)===0?"boundDiamonds":"diamonds",-Number(row.NeedPoints)*count,"residence:furniture");changeFurniture(this.save,Number(row.TemplateId),count,this.c.now());for(let i=0;i<count;i++){const id=this.save.nextId!++;this.save.layout![id]={id,templateId:Number(row.TemplateId),pos_x:-1,pos_y:-1,rotation:0};}}
   else if([3,6].includes(op)){
    saveResidenceLayout(this.save,r.furniture??[]);
   }else if(op===7){if(!this.active)throw new ResidenceError("Entre na residência para coletar o ouro.");const amount=collectResidence(this.save,this.c.now(),gold=>{this.c.ledger.change(this.c.saved.state,this.c.userId,"gold",gold,"residence:collect");});notices.push(...this.c.notice(amount?`Residência: coletado ${amount} de ouro.`:"A residência ainda não produziu ouro suficiente para coleta."));}
   else if(op===9)notices.push(...this.c.notice(`Residência: ${this.save.accrued} de ouro armazenado. Produção: ${this.save.rate} ouro/h. Limite: 12 horas.`));
   else if([1,5].includes(op)){const field=op===1?"houseLevel":"courtyardLevel";if(this.save[field]!<2){this.c.ledger.change(this.c.saved.state,this.c.userId,"gold",-residencePolicy.upgradeGold,"residence:upgrade");this.save[field]=2;}}
   else if([8,10].includes(op)){this.c.ledger.change(this.c.saved.state,this.c.userId,Number(r.pay_type)===0?"boundDiamonds":"diamonds",-residencePolicy.maidDiamonds,"residence:maid");this.save.maidAt=Math.max(this.c.now(),this.save.maidAt??0)+residencePolicy.maidDurationMs;}
   else if(op===1004){this.save.cleanliness=Math.min(100,(this.save.cleanliness??100)+1);}
   else if(![4,11,12,13,1006,1007].includes(op))throw new ResidenceError("Escolha uma ação válida na Residência.");
   this.c.persist();return[this.snapshot([3,6].includes(op)),{opcode:109,message:{}},{opcode:3,message:{}},...notices];
  });
  if([1001,1002,1003].includes(op)&&this.active)this.join();
  if([3,6].includes(op)&&this.active)this.hub.broadcast(this.c.userId,this.snapshot(true));
  return packets;
 }
}
