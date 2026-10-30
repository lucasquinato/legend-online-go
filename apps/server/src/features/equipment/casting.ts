import {randomInt} from "node:crypto";
import {InventoryError,itemTemplate,type Inventory} from "../../inventory.js";
import type {Message} from "../../messages.js";
import {selectedForgeEquipment} from "./purification.js";
import {halidomIds} from "./advanced-content.js";
export function castingCap(templateId:number):number{
 const t=itemTemplate(templateId);if(!t||Number(t.NeedGrades)<50||Number(t.Profile)<5||Number(t.StrengthenMax)<=0)return 0;
 return halidomIds.has(templateId)?(templateId%10000>=7?160:80):Number(t.NeedGrades)>=70?160:80;
}
export function castingChance(grade:number,bless:number):number{
 if(!Number.isSafeInteger(grade)||grade<0||!Number.isSafeInteger(bless)||bless<0||bless>100)throw new InventoryError("Grau ou bênção do molde divino inválidos");
 const next=grade%10+1,base=next<=5?50-10*(next-1):5;
 return Math.min(100,base+bless);
}
export function castEquipment(inventory:Inventory,level:number,r:Message,debit:(gold:number)=>void,buy:(id:number,count:number,payType:number)=>boolean,draw:(size:number)=>number=randomInt):Message{
 const item=selectedForgeEquipment(inventory),grade=Number(item.mould_grade??0),cap=castingCap(item.template_id),payType=Number(r.pay_type??0);
 if(level<50||!cap)throw new InventoryError("Molde divino exige nível 50 e equipamento épico de nível 50 ou superior");
 if(!Number.isInteger(grade)||grade<0||grade>=cap||![0,1].includes(payType))throw new InventoryError("Este equipamento atingiu o limite do molde divino");
 const next=grade%10+1,bless=Number(item.bless_value??0),chance=castingChance(grade,bless);
 const gold=(grade>80?1000:500)*(8+next)**3;
 const special=halidomIds.has(Number(item.template_id));
 const materials=grade<80?[[2120100,special?10:5],[2120101,special?30:15]]:[[2120102,special?15:5],[2120103,special?45:15]];
 for(const [id,amount]of materials){const available=inventory.countTemplate(id!),used=Math.min(available,amount!),missing=amount!-used;
  if(used&&inventory.consumeTemplate(id!,used).some(i=>i.bind))item.bind=1;
  if(missing&&buy(id!,missing,payType))item.bind=1;
 }
 debit(gold);const success=chance===100||draw(10000)<chance*100;
 item.mould_grade=grade+(success?1:0);item.bless_value=success?0:Math.min(100,bless+5);
 return{streng_result:success?1:0,strengthenGrade:item.mould_grade,pos:0,objectId:0,bagType:0,$8:{wire:0,value:String(item.bless_value)}};
}
export function castingAddition(base:number,grade:number):number{
 return Math.trunc(base*Math.min(grade,80)*.3)+Math.trunc(base*Math.max(0,Math.min(grade-80,80))*.4);
}
