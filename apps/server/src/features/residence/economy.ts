import { residencePolicy } from "./policy.js";
import { furniture } from "../navigation/content.js";
export interface ResidenceSave { owned:boolean; furniture:Record<string,number>; accrued:number; remainder:number; productiveMs:number; lastAt:number; rate:number; layout?:Record<string,{id:number;templateId:number;pos_x:number;pos_y:number;rotation:number}>; nextId?:number; houseLevel?:number; courtyardLevel?:number; maidAt?:number; cleanliness?:number }
const HOUR=3600000, CAP=12*HOUR;
export class ResidenceError extends Error {}
export function initialResidence(now:number):ResidenceSave{return{owned:false,furniture:{},accrued:0,remainder:0,productiveMs:0,lastAt:now,rate:100000};}
export function totalLuxury(s:ResidenceSave):number {
 let value=0;
 for(const [id,count] of Object.entries(s.furniture)){
  const row=furniture.find(f=>Number(f.TemplateId)===Number(id));
  if(!row||!Number.isSafeInteger(count)||count<0)throw new ResidenceError("Propriedade de móvel inválida.");
  value+=Number(row.Luxury)*count;
 }
 return value;
}
export function residenceRate(s:ResidenceSave,luxuryTarget:number=residencePolicy.luxuryTarget):number {
 const luxury=totalLuxury(s);
 if(luxury===0)return 100000;
 if(!Number.isFinite(luxuryTarget)||luxuryTarget!<=0)throw new ResidenceError("Meta de luxo inválida.");
 return Math.min(1000000,100000+Math.floor(900000*luxury/luxuryTarget!));
}
/** Settles the old rate first. Productive time, rather than a changing money cap, limits storage. */
export function settleResidence(s:ResidenceSave,now:number):void {
 if(!Number.isSafeInteger(now))throw new ResidenceError("Relógio inválido para produção da residência.");
 if(now<s.lastAt)return; // A backward wall-clock adjustment never duplicates production.
 if(s.owned){const dt=Math.min(now-s.lastAt,Math.max(0,CAP-s.productiveMs)),scaled=s.rate*dt+s.remainder;s.accrued+=Math.floor(scaled/HOUR);s.remainder=scaled%HOUR;s.productiveMs+=dt;}
 s.lastAt=now;
}
export function changeFurniture(s:ResidenceSave,id:number,delta:number,now:number,luxuryTarget:number=residencePolicy.luxuryTarget):void {
 if(!s.owned||!Number.isSafeInteger(delta)||delta===0)throw new ResidenceError("Alteração de móvel inválida.");
 const next=structuredClone(s);const count=(next.furniture[id]??0)+delta;if(count<0)throw new ResidenceError("Móveis insuficientes.");next.furniture[id]=count;
 const rate=residenceRate(next,luxuryTarget);settleResidence(s,now);s.furniture=next.furniture;s.rate=rate;
}
/** Caller commits ledger credit and this reset in the same gameplay transaction. */
export function collectResidence(s:ResidenceSave,now:number,credit:(gold:number)=>void):number {
 if(!s.owned)throw new ResidenceError("Moradia ainda não adquirida.");
 const next=structuredClone(s);settleResidence(next,now);const amount=next.accrued;if(amount)credit(amount);
 next.accrued=0;next.remainder=0;next.productiveMs=0;Object.assign(s,next);return amount;
}
