import type { ResidenceSave } from "./economy.js";
import { settleResidence,residenceRate } from "./economy.js";
import { furniture } from "../navigation/content.js";
/** One owned copy per catalog template, stored rather than placed; safe to repeat. */
export function grantResidenceDecorations(save:ResidenceSave,now:number):number {
 settleResidence(save,now);save.layout??={};save.nextId=Math.max(save.nextId??1,...Object.keys(save.layout).map(Number).map(id=>id+1));
 let granted=0;
 for(const row of furniture){const templateId=Number(row.TemplateId),owned=Object.values(save.layout).filter(item=>item.templateId===templateId).length;
  const count=Math.max(Number(save.furniture[templateId]??0),owned);save.furniture[templateId]=count;
  if(!count){const id=save.nextId++;save.layout[id]={id,templateId,pos_x:-1,pos_y:-1,rotation:0};save.furniture[templateId]=1;granted++;}
  else if(!owned){const id=save.nextId++;save.layout[id]={id,templateId,pos_x:-1,pos_y:-1,rotation:0};}
 }
 save.rate=residenceRate(save);return granted;
}
