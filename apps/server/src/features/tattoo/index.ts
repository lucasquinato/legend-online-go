import { randomInt } from "node:crypto";
import { type Inventory, InventoryError, inventoryUpdates } from "../../inventory.js";
import { type Message, encodeMessage, decodeMessage, typeName } from "../../messages.js";
import type { CityState, CityPacket } from "../../city-state.js";
import type { AttributeState } from "../../attributes.js";
import type { CurrencyLedger } from "../currencies/index.js";
import { currencyBalance } from "../currencies/index.js";
import { config, engravingRows, unlockedSlots, properties, primaryFields, dyes, materialPerAttempt, localTattooPolicy } from "./content.js";

export class TattooError extends Error {}
export interface TattooPair { type:number; add:number; plus:number; reduce:number; minus:number }
export interface TattooSave { version:1; holes:{applied?:TattooPair; proposal?:TattooPair}[]; engravings:{level:number}[] }
interface Context {
  readonly state: CityState; readonly saved:{tattoo?:TattooSave;attributes?:AttributeState;battle?:{finished:boolean}};
  userId:number; ledger:CurrencyLedger; inventory():Inventory; persist():void; atomic<T>(action:()=>T):T;
}
export const tattooSchemas = {9568:typeName("tattoo.TattooHoleReqMsg"),9603:typeName("tattoo.TattooEnhanceReqMsg"),274:typeName("tattoo.TattooHoleRspMsg"),346:typeName("tattoo.TattooEnhanceListMsg")};
export class TattooFeature {
  constructor(private c:Context,private roll=(max:number)=>randomInt(max)){}
  get level(){return Number(this.c.state.player.grades);}
  get save():TattooSave {return this.c.saved.tattoo??={version:1,holes:Array.from({length:8},()=>({})),engravings:Array.from({length:4},()=>({level:0}))};}
  private pick(values:number[]){return values[this.roll(values.length)]!;}
  private integer(value:unknown,min:number,max:number,label:string):number {if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)throw new TattooError(label);return value;}
  private pay(cost:number,payType:number,reason:string){
    if(![1,2].includes(payType))throw new TattooError("Forma de pagamento de tatuagem inválida");
    const bound=payType===2?Math.min(cost,currencyBalance(this.c.state,"boundDiamonds")):0;
    this.c.ledger.changeMany(this.c.state,this.c.userId,{...(bound?{boundDiamonds:-bound}:{}),...(cost>bound?{diamonds:-(cost-bound)}:{})},reason);
  }
  private wash(r:Message){
    const index=this.integer(r.param2,1,unlockedSlots(this.level),"Espaço de tatuagem bloqueado")-1;
    const kind=this.integer(r.param1,1,2,"Tipo de material inválido") as 1|2;
    for(const flag of [r.refresh_lock_add,r.refresh_lock_minus,r.auto_buy])if(flag!==undefined&&![0,1,false,true].includes(flag))throw new TattooError("Opção de tatuagem inválida");
    const hole=this.save.holes[index]!,old=hole.applied;
    const addLock=!!r.refresh_lock_add,minusLock=!!r.refresh_lock_minus;
    if((addLock||minusLock)&&!old)throw new TattooError("Aplique uma tatuagem antes de travar seus atributos");
    const inv=this.c.inventory(),template=dyes[kind];
    const available=inv.countTemplate(template);
    const used=Math.min(available,materialPerAttempt),missing=materialPerAttempt-used;
    if(missing&&!r.auto_buy)throw new InventoryError("São necessários 100 materiais de tatuagem por tentativa");
    if(missing)this.pay(missing*localTattooPolicy.autoBuyUnitPrice[kind]!,Number(r.material_pay_type),"tattoo:auto-buy");
    const locks=Number(addLock)+Number(minusLock);
    if(locks)this.pay(locks*Number(config("tattoo_refresh_lock_price")),Number(r.lock_pay_type),"tattoo:locks");
    if(used)inv.consumeTemplate(template,used);
    const add=addLock?old!.add:this.pick(properties.filter(p=>!minusLock||p!==old!.reduce));
    const reduce=minusLock?old!.reduce:this.pick(properties.filter(p=>p!==add));
    const cap=Number(config(kind===1?"Low_Tattoo_Proterty_Gegion":"Hight_Tattoo_Proterty_Gegion").split(",")[1]);
    const minusCap=Number(config(kind===1?"Low_Tattoo_Proterty_Reduce_Gegion":"Higth_Tattoo_Proterty_Reduce_Gegion").split(",")[1]);
    const previous=old?.plus??0;
    // Exact positive increment bounds shown in TattooPopFrame; never lower an
    // advanced tattoo by selecting its basic material.
    const maxStep=kind===1?Math.max(0,Math.ceil(10*(cap-previous)/cap)):Math.max(0,Math.ceil(20*(cap-previous)/cap)+20);
    const minStep=kind===1?1:21;
    const increment=previous>=cap?0:minStep+this.roll(Math.max(1,maxStep-minStep+1));
    const decrease=1+this.roll(Math.max(1,Math.ceil(10*(minusCap-(old?.minus??0))/minusCap)));
    hole.proposal={type:kind,add,reduce,plus:Math.max(previous,Math.min(cap,previous+increment)),minus:Math.min(minusCap,(old?.minus??0)+decrease)};
    return index;
  }
  private apply(r:Message){
    const index=this.integer(r.param2,1,unlockedSlots(this.level),"Espaço de tatuagem bloqueado")-1,hole=this.save.holes[index]!;
    if(!hole.proposal)throw new TattooError("Não existe proposta de tatuagem para substituir");
    hole.applied=hole.proposal;delete hole.proposal;return index;
  }
  private engrave(r:Message){
    if(this.level<80)throw new TattooError("Gravações são liberadas no nível 80");
    const index=this.integer(r.holeId,1,4,"Posição de gravação inválida")-1,row=this.save.engravings[index]!;
    if(!this.save.holes.some(h=>h.applied))throw new TattooError("Aplique uma tatuagem antes de gravar");
    if(row.level>=10)throw new TattooError("Gravação já está no nível máximo");
    if(r.wish!==undefined&&![0,1,false,true].includes(r.wish))throw new TattooError("Opção de bênção inválida");
    const [item,count]=config("tattoo_enhance_consume_item").split("|")[index]!.split(",").map(Number);
    this.c.inventory().consumeTemplate(item!,count!);
    const next=engravingRows.get(row.level+1)!,weights=next.TemplateName!.split(",").map(Number);
    if(r.wish)this.pay(Number(config("tattoo_enhance_wish_point")),1,"tattoo:engraving-blessing");
    if(r.wish||this.roll(weights.reduce((n,v)=>n+v,0))<weights[0]!+weights[1]!)row.level++;
  }
  private wireHole(index:number):Message {
    const h=this.save.holes[index]!,a=h.applied,p=h.proposal;
    return {hole:index+1,oldTattooType:a?.type??0,oldAddProperty:a?.add??-1,oldAddingValue:a?.plus??0,oldReduceProperty:a?.reduce??-1,oldReduceValue:-(a?.minus??0),newTattooType:p?.type??0,newAddProperty:p?.add??-1,newAddingValue:p?.plus??0,newReduceProperty:p?.reduce??-1,newReduceValue:-(p?.minus??0)};
  }
  packets(op=1,index?:number):CityPacket[]{
    return [
      {opcode:274,body:encodeMessage(tattooSchemas[274],{opType:op,holeInfo:index===undefined?Array.from({length:unlockedSlots(this.level)},(_,i)=>this.wireHole(i)):[this.wireHole(index)]}).toString("base64")},
      {opcode:346,body:encodeMessage(tattooSchemas[346],{tattooEnhance:this.save.engravings.map((r,i)=>({holdId:i+1,level:r.level,property:localTattooPolicy.engravingProperties[i],enable:Number(this.level>=80&&this.save.holes.some(h=>h.applied))}))}).toString("base64")},
    ];
  }
  synchronize(){
    const values:Record<string,number>={},deductions:Record<string,number>={},percent:Record<number,number>={};
    if(this.level>=80)this.save.engravings.forEach((r,i)=>{percent[localTattooPolicy.engravingProperties[i]!]=Number(engravingRows.get(r.level)?.Data??0);});
    for(const h of this.save.holes.slice(0,unlockedSlots(this.level)))if(h.applied){const p=h.applied;
      values[primaryFields[p.add]!]=(values[primaryFields[p.add]!]??0)+p.plus;
      deductions[primaryFields[p.reduce]!]=(deductions[primaryFields[p.reduce]!]??0)+p.minus;
    }
    // TattooModel truncates the percentage of each net primary contribution.
    for(const p of properties){const key=primaryFields[p]!,net=Math.trunc(((values[key]??0)-(deductions[key]??0))*(100+(percent[p]??0))/100);values[key]=Math.max(0,net);deductions[key]=Math.max(0,-net);}
    this.c.saved.attributes!.sources.tattoo={kind:"permanent",evidence:"local-balance",values,deductions};
  }
  handle(op:number,body:Buffer):CityPacket[]|undefined{
    if(op!==9568&&op!==9603)return;
    let r:Message;try{r=decodeMessage(tattooSchemas[op],body);}catch{throw new TattooError("Solicitação de tatuagem inválida");}
    if(op===9568&&r.opType===1)return this.packets();
    if(this.c.saved.battle&&!this.c.saved.battle.finished)throw new TattooError("Finalize a batalha antes de alterar tatuagens");
    return this.c.atomic(()=>{
      const before=structuredClone(this.c.state.items);let index:number|undefined;
      if(op===9603)this.engrave(r);
      else if(r.opType===2)index=this.wash(r);
      else if(r.opType===3)index=this.apply(r);
      else throw new TattooError("Operação de tatuagem inválida");
      this.c.persist();
      return [
        ...this.packets(op===9568?r.opType:1,index),
        {opcode:115,message:{moved:inventoryUpdates(before,this.c.state.items)}},
        ...[3,109,113,150].map(opcode=>({opcode,message:{}})),
      ];
    });
  }
}
