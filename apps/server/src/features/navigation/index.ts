import { residencePolicy } from "../residence/policy.js";
import { SocialFeature, queueLocalEvent } from "../social/index.js";
import { randomInt, randomUUID } from "node:crypto";
import type { Store } from "../../store.js";
import type { CityPacket, CityState } from "../../city-state.js";
import { type Message, typeName, decodeMessage, encodeMessage } from "../../messages.js";
import { gameDay, gameTimeZone } from "../../game-clock.js";
import { CurrencyLedger, currencyAnnexes, currencyBalance } from "../currencies/index.js";
import { type Inventory, inventoryUpdates } from "../../inventory.js";
import { navigationConfig as config, navigationUpgrade as upgrade, tasks, offers } from "./content.js";
export class NavigationError extends Error {}
export const NAVIGATION_SCHEMA = "CREATE TABLE IF NOT EXISTS local_navigation(user_id INTEGER PRIMARY KEY,state TEXT NOT NULL)";
const policy=residencePolicy.navigation;
interface Boat { id:string; grade:number; state:number; cd:number; nextGrade?:number }
interface Port { id:string; grade:number; cd:number; boatId:string; tasks:{id:number;count:number;used:boolean}[]; pay:number }
export interface NavigationSave { version:1;day:string;strength:number;buys:number;shopBuys:number;invites:number;assists:number;fishingRewards:number;boats:Boat[];ports:Port[];shop:{id:number;buy:boolean}[]; shopAt?:number;fish?:{boats:string[];lastAt:number;endAt:number};fishPending?:{gold:number;coins:number};invitations:Record<string,{boat:string;recipient:number;used:boolean;expiresAt?:number}> }
/** Administrative reset: keep currencies, progress and quotas; discard missions without new payouts. */
export function resetNavigationMissions(save:NavigationSave):void {
 for(const port of save.ports){port.cd=0;port.boatId="";port.tasks=[];}
 for(const boat of save.boats)if(boat.state===1){boat.state=0;boat.cd=0;}
}
interface Context {store:Store;userId:number;readonly state:CityState;inventory():Inventory;ledger:CurrencyLedger;now():number;persist():void;atomic<T>(fn:()=>T):T}
const names:Record<number,string>={343:"NavigationBoatUpgradeInviteMsg",341:"NavigationResMsg",342:"NavigationMsg",178:"NavigationFishingStateMsg"};
export const navigationPacket=(opcode:number,message:Message):CityPacket=>({opcode,body:encodeMessage(typeName(`pet.${names[opcode]}`),message).toString("base64")});
/** All comparisons use the configured wall clock; timestamps on the wire are milliseconds. */
export function fishingWindow(now:number):{open:boolean;startTime:number;endTime:number} {
 const minute=Number(new Intl.DateTimeFormat("en-US",{timeZone:gameTimeZone,minute:"2-digit"}).format(new Date(now)));
 const atMinute=Math.floor(now/60000)*60000;
 return {open:minute>=30,startTime:atMinute+(30-minute)*60000,endTime:atMinute+(60-minute)*60000};
}
export class NavigationFeature {
 private nextTick=0;
 private lastModel="";
 constructor(private c:Context,private draw=(n:number)=>randomInt(n)){c.store.db.exec(NAVIGATION_SCHEMA);}
 get available():boolean{return Number(this.c.state.player.grades)>=50;}
 private read(id=this.c.userId):NavigationSave {
  const row=this.c.store.db.prepare("SELECT state FROM local_navigation WHERE user_id=?").get(id);
  const s:NavigationSave=row?JSON.parse(String(row.state)):{version:1,day:gameDay(this.c.now()),strength:100,buys:0,shopBuys:0,invites:0,assists:0,fishingRewards:0,boats:[{id:"1",grade:1,state:0,cd:0}],ports:[1,2,3].map(id=>({id:String(id),grade:1,cd:0,boatId:"",tasks:[],pay:0})),shop:[],invitations:{}};
  this.advanceFishing(s);
  const day=gameDay(this.c.now());
  if(s.day!==day){s.day=day;s.strength=100;s.buys=s.shopBuys=s.invites=s.assists=s.fishingRewards=0;for(const p of s.ports)p.pay=0;}
  for(const b of s.boats) if(b.cd>0&&b.cd<=this.c.now()) {
   if(b.state===3){b.grade=b.nextGrade!;delete b.nextGrade;b.state=0;b.cd=0;}else if(b.state===1){b.state=2;b.cd+=policy.restMs;if(b.cd<=this.c.now()){b.state=0;b.cd=0;}}else if(b.state!==4){b.state=0;b.cd=0;}
  }
  while(s.boats.length<5 && s.boats.at(-1)!.grade>=3)s.boats.push({id:String(s.boats.length+1),grade:1,state:0,cd:0});
  for(const p of s.ports){if(p.cd>0&&p.cd<=this.c.now()){p.cd=0;p.boatId="";this.newTasks(p);}else if(!p.tasks.length&&p.cd===0)this.newTasks(p);}
  if(!s.shop.length||!s.shopAt||s.shopAt<=this.c.now())this.newShop(s);
  return s;
 }
 private write(s:NavigationSave,id=this.c.userId):void{this.c.store.db.prepare("INSERT INTO local_navigation(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state").run(id,JSON.stringify(s));}
 private quality():number{let n=this.draw(100);for(let i=0;i<policy.qualityWeights.length;i++){n-=policy.qualityWeights[i]!;if(n<0)return i+1;}return 5;}
 /** Family eligibility is original; provisional quality weights are centralized in policy. */
 private newTasks(p:Port):void {
  const pool=tasks.filter(t=>Number(t.Quality)===1&&Number(t.RefreshPort)===Number(p.id));
  const count=Number(upgrade(161,p.grade)!.ActiveObject);p.tasks=[];
  while(pool.length&&p.tasks.length<count){const i=this.draw(pool.length),t=pool.splice(i,1)[0]!;const quality=this.quality(),row=tasks.find(r=>Number(r.Types)===Number(t.Types)&&Number(r.Quality)===quality)!;p.tasks.push({id:Number(row.TemplateId),count:0,used:false});}
 }
 private newShop(s:NavigationSave):void {
  const pool=offers.filter(t=>Number(t.Random)>0);s.shop=[];s.shopAt=this.c.now()+policy.shopRefreshMs;
  while(pool.length&&s.shop.length<6){let point=this.draw(pool.reduce((n,t)=>n+Number(t.Random),0));let index=0;while(point>=Number(pool[index]!.Random))point-=Number(pool[index++]!.Random);s.shop.push({id:Number(pool.splice(index,1)[0]!.ShopId),buy:true});}
 }
 private snapshots(s:NavigationSave):CityPacket[]{
  const port=s.ports.map(p=>{const m:Message={id:p.id,grades:p.grade,cd:p.cd,shippingBoatId:p.boatId,payBusinessNum:p.pay};for(let i=0;i<6;i++){m[`taskId${i+1}`]=p.tasks[i]?.id??0;m[`taskNum${i+1}`]=p.tasks[i]?.count??0;m[`selectedTask${i+1}`]=Number(p.tasks[i]?.used??false);}return m;});
  return [navigationPacket(342,{strength:s.strength,currency:currencyBalance(this.c.state,"navigationCoin"),dayBuyShopNum:s.shopBuys,dayBuyStrengthNum:s.buys,shopRefreshCD:s.shopAt??0,inviteNum:s.invites,assistNum:s.assists,fishingTime:s.fishingRewards*20,buyData:s.shop.map((o,index)=>({index:index+1,shopId:o.id,buy:Number(o.buy)})),port,boat:s.boats.map(({id,grade,state,cd})=>({id,grade,state,cd}))}),navigationPacket(178,{...fishingWindow(this.c.now()),open:Number(fishingWindow(this.c.now()).open)})];
 }
 private advanceFishing(s:NavigationSave):void {
  const fish=s.fish;if(!fish)return;const until=Math.min(this.c.now(),fish.endAt);
  while(fish.lastAt+policy.fishingIntervalMs<=until&&s.fishingRewards<policy.fishingDailyMax){fish.lastAt+=policy.fishingIntervalMs;s.fishingRewards++;
   const pending=(s.fishPending??={gold:0,coins:0});pending.gold+=policy.fishingGold*fish.boats.length;pending.coins+=policy.fishingCoins*fish.boats.length;}
  if(this.c.now()>=fish.endAt||s.fishingRewards>=policy.fishingDailyMax)this.stopFishing(s,Math.min(until,fish.lastAt));
 }
 private stopFishing(s:NavigationSave,at=this.c.now()):void {
  for(const id of s.fish?.boats??[]){const b=s.boats.find(b=>b.id===id);if(b){b.state=2;b.cd=at+policy.restMs;}}delete s.fish;
 }
 private claimFishing(s:NavigationSave):string[] {
  const pending=s.fishPending;if(!pending)return[];const given:{gold:number;coins:number}={gold:0,coins:0};
  for(const [field,currency] of [["gold","gold"],["coins","navigationCoin"]] as const){const amount=Math.min(pending[field],Math.max(0,2147483647-currencyBalance(this.c.state,currency)));if(amount){this.c.ledger.change(this.c.state,this.c.userId,currency,amount,"navigation:fishing");pending[field]-=amount;given[field]=amount;}}
  return given.gold||given.coins?[`Pesca: +${given.gold} ouro, +${given.coins} Moedas de Navegação.`]:[];
 }
 private withTips(packets:CityPacket[],tips:string[]):CityPacket[]{if(tips.length){const p=packets.find(p=>p.opcode===342)!;const model=decodeMessage(typeName("pet.NavigationMsg"),Buffer.from(p.body!,"base64"));p.body=navigationPacket(342,{...model,fishingTipsList:tips}).body;}return packets;}
 initialPackets():CityPacket[]{if(!this.available)return[];return this.c.atomic(()=>{const s=this.read(),tips=this.claimFishing(s);this.write(s);if(tips.length)this.c.persist();return this.withTips(this.snapshots(s),tips);});}
 tick():CityPacket[]{
  if(!this.available||this.c.now()<this.nextTick)return[];
  this.nextTick=this.c.now()+1000;
  return this.c.atomic(()=>{const s=this.read(),tips=this.claimFishing(s),packets=this.withTips(this.snapshots(s),tips),key=JSON.stringify(packets);
   if(key===this.lastModel)return[];this.write(s);this.lastModel=key;if(tips.length){this.c.persist();packets.push({opcode:109,message:{}},{opcode:4725,message:{}});}return packets;});
 }
 private debit(currency:"gold"|"spirit"|"diamonds"|"boundDiamonds"|"lightCrystal"|"labyrinthCoin"|"navigationCoin",amount:number,reason:string):void {if(amount)this.c.ledger.change(this.c.state,this.c.userId,currency,-amount,`navigation:${reason}`);}
 handle(opcode:number,body:Buffer):CityPacket[]|undefined {
  if(opcode!==9600)return;
  if(!this.available)throw new NavigationError("Mistérios de Navegação exige nível 50.");
  const r=decodeMessage(typeName("pet.NavigationOpMsg"),body);
  return this.c.atomic(()=>{
   const s=this.read(),before=structuredClone(this.c.state.items),op=Number(r.op),tips:string[]=[];
   const boat=()=>{const b=s.boats.find(b=>b.id===String(r.param1));if(!b)throw new NavigationError("Navio não encontrado.");return b;};
   const port=()=>{const p=s.ports.find(p=>p.id===String(r.param1));if(!p)throw new NavigationError("Porto não encontrado.");return p;};
   switch(op){
    case 0: if(s.boats.length>=5||s.boats.at(-1)!.grade<3)throw new NavigationError("Próximo navio: eleve o navio anterior ao nível 3. A abertura é gratuita.");break;
    case 1:case 2:case 7:case 12:case 13:break;
    case 3:{const b=boat(),next=upgrade(118,b.grade+1);if(b.state!==0||!next)throw new NavigationError("Navio ocupado ou no nível máximo.");this.debit("navigationCoin",Number(next.Data),"boat-upgrade");b.nextGrade=b.grade+1;b.state=3;b.cd=this.c.now()+config("boat_upgrade_cd")*60000;break;}
    case 4:{const b=boat(),social=new SocialFeature(this.c.store,this.c.userId),recipients=[...new Set((r.param5??[]).map(Number))] as number[];
     if(b.state!==3||!recipients.length||recipients.length>3-s.invites||recipients.some(id=>!social.friends().includes(id)))throw new NavigationError("Selecione amigos disponíveis e respeite o limite de três convites diários.");
     for(const recipient of recipients){const token=randomUUID();s.invitations[token]={boat:b.id,recipient,used:false,expiresAt:this.c.now()+policy.assistExpiryMs};queueLocalEvent(this.c.store,recipient,navigationPacket(343,{playerId:this.c.userId,playerName:social.profile(this.c.userId)!.nickname,boatId:b.id,token}));s.invites++;}break;}
    case 5:{const owner=Number(r.param3),social=new SocialFeature(this.c.store,this.c.userId);if(owner===this.c.userId||!social.canVisit(owner)||s.assists>=5)throw new NavigationError("Auxílio indisponível ou limite diário atingido.");
     const other=this.read(owner),invite=other.invitations[String(r.param2)],b=other.boats.find(b=>b.id===String(r.param1));
     if(!invite||invite.used||invite.recipient!==this.c.userId||invite.boat!==b?.id||(invite.expiresAt??0)<this.c.now()||b.state!==3)throw new NavigationError("Convite expirado ou já utilizado.");
     invite.used=true;b.cd=Math.max(this.c.now(),b.cd-policy.assistMs);this.write(other,owner);const updated=this.read(owner);this.write(updated,owner);
     queueLocalEvent(this.c.store,owner,navigationPacket(342,{boat:updated.boats.map(({id,grade,state,cd})=>({id,grade,state,cd}))}));
     s.assists++;this.c.ledger.change(this.c.state,this.c.userId,"navigationCoin",40,"navigation:assist");break;}
    case 6:{const b=boat();if(![2,3].includes(b.state))throw new NavigationError("Navio sem espera para acelerar.");this.debit("diamonds",Math.ceil(Math.max(0,b.cd-this.c.now())/60000)*policy.speedupDiamondsPerMinute,"boat-speedup");if(b.state===3){b.grade=b.nextGrade!;delete b.nextGrade;}b.state=0;b.cd=0;break;}
    case 8:if(s.buys>=2)throw new NavigationError("Limite de duas compras de movimento por dia.");this.debit(Number(r.param3)===0?"boundDiamonds":"diamonds",100,"movement");s.strength+=100;s.buys++;break;
    case 9:{const p=port(),index=Number(r.param4)-1,entry=p.tasks[index];if(p.boatId||p.cd>this.c.now()||!entry||entry.used)throw new NavigationError("Tarefa indisponível para renovação.");const old=tasks.find(t=>Number(t.TemplateId)===entry.id)!;this.debit(Number(r.param3)===0?"boundDiamonds":"diamonds",config("port_task_refresh_point"),"task-quality");const quality=this.quality();entry.id=Number(tasks.find(t=>Number(t.Types)===Number(old.Types)&&Number(t.Quality)===quality)!.TemplateId);break;}
    case 10:{const p=port();if(p.boatId||p.cd>this.c.now())throw new NavigationError("Porto ocupado.");p.tasks=[];p.cd=this.c.now()+config("port_task_refresh_cd")*60000;break;}
    case 11:{
     const p=port(),b=s.boats.find(b=>b.id===String(r.param2));
     if(p.boatId||p.cd>this.c.now()||!b||b.state!==0)throw new NavigationError("Porto ou navio indisponível.");
     const ids=(r.param5??[]) as number[],counts=(r.param6??[]) as number[];
     if(!ids.length||ids.length!==counts.length||new Set(ids).size!==ids.length)throw new NavigationError("Seleção comercial inválida.");
     if(s.strength<20)throw new NavigationError("Movimento insuficiente.");
     let reward=0;
     for(let i=0;i<ids.length;i++){
      // Native NavigationPortFrame.taskList contains one-based positions, not template IDs.
      const slot=ids[i]!,entry=Number.isInteger(slot)&&slot>=1?p.tasks[slot-1]:undefined,t=entry&&tasks.find(t=>Number(t.TemplateId)===entry.id),count=counts[i]!;
      if(!entry||entry.used||!t||!Number.isInteger(count)||count<1||count>Number(upgrade(161,p.grade)!.Data))throw new NavigationError("Tarefa indisponível ou quantidade inválida.");
      const [template,amount]=String(t.ConsumedItems).split(",").map(Number);const qty=amount!*count;
      const token=template===208009?"labyrinthCoin":template===208001?"arenaMedal":currencyAnnexes[template!];
      if(template!<0||token){const currency=token;if(!currency)throw new NavigationError("Recurso de negociação inválido.");this.c.ledger.change(this.c.state,this.c.userId,currency,-qty,"navigation:trade");}else this.c.inventory().consumeTemplate(template!,qty);
      entry.used=true;entry.count=count;reward+=Number(t.ObtainedCurrency)*count;
     }
     this.c.ledger.change(this.c.state,this.c.userId,"navigationCoin",reward,"navigation:trade-reward");
     s.strength-=20;b.state=1;b.cd=this.c.now()+Math.max(0,config("boat_shipping_cd")-Number(upgrade(118,b.grade)!.ActiveObject))*60000;p.boatId=b.id;p.cd=b.cd;
     break;
    }
    case 14:{
     const i=Number(r.param3)-1,slot=s.shop[i],offer=slot&&offers.find(o=>Number(o.ShopId)===slot.id);
     if(!Number.isInteger(i)||!slot?.buy||!offer)throw new NavigationError("Oferta indisponível.");
     if(s.shopBuys>=6)throw new NavigationError("Limite de seis compras de Navegação por dia.");
     this.debit("navigationCoin",Number(offer.Currency),"shop");this.debit("diamonds",Number(offer.Diamond),"shop");
     this.c.inventory().add({template_id:Number(offer.ItemId),bag_type:1,object_id:0,bind:1,exist:1},Number(offer.Count));slot.buy=false;s.shopBuys++;break;
    }
    case 15:if(Number(r.param3)===1){this.debit(Number(r.param4)===0?"boundDiamonds":"diamonds",10,"shop-refresh");this.newShop(s);}break;
    case 16:{const window=fishingWindow(this.c.now()),ids=String(r.param2??"").split(",").filter(Boolean);if(!window.open)throw new NavigationError("Pesca disponível do minuto 30 ao fim de cada hora.");if(s.fish||s.fishingRewards>=30||!ids.length||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>!s.boats.some(b=>b.id===id&&b.state===0)))throw new NavigationError("Selecione navios disponíveis; limite de 30 recompensas diárias.");if(s.strength<20)throw new NavigationError("Movimento insuficiente.");this.debit("diamonds",[0,20,40,60,80][ids.length-1]!,"fishing-fleet");s.strength-=20;s.fish={boats:ids,lastAt:this.c.now(),endAt:window.endTime};for(const id of ids){const b=s.boats.find(b=>b.id===id)!;b.state=4;b.cd=window.endTime;}break;}
    case 17:this.stopFishing(s);break;
    case 18:tips.push(...this.claimFishing(s));break;
    case 19:{const p=port(),next=upgrade(161,p.grade+1);if(!next||p.boatId||p.cd>this.c.now())throw new NavigationError("Porto ocupado ou no nível máximo.");const [coins,diamonds]=String(next.TemplateName).split(",").map(Number);this.debit("navigationCoin",coins!,"port-upgrade");this.debit("diamonds",diamonds!,"port-upgrade");p.grade++;break;}
    case 20:{const p=port();if(p.boatId||p.pay>=Number(upgrade(161,p.grade)!.TemplateId))throw new NavigationError("Renovação comercial indisponível.");this.debit("diamonds",config("refresh_consumption"),"port-refresh");p.pay++;p.cd=0;this.newTasks(p);break;}
    default:throw new NavigationError("Operação de Navegação desconhecida.");
   }
   while(s.boats.length<5&&s.boats.at(-1)!.grade>=3)s.boats.push({id:String(s.boats.length+1),grade:1,state:0,cd:0});
   this.write(s);this.c.persist();
   return [...this.withTips(this.snapshots(s),tips),{opcode:115,message:{moved:inventoryUpdates(before,this.c.state.items)}},...[3,109,4725].map(opcode=>({opcode,message:{}})),navigationPacket(341,{op,result:1})];
  });
 }
}
