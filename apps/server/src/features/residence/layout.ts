import type { Message } from "../../messages.js";
import { furniture } from "../navigation/content.js";
import { ResidenceError,type ResidenceSave } from "./economy.js";
const typeOf=(id:number)=>Number(furniture.find(row=>Number(row.TemplateId)===id)?.Type);
/** Native save sends every placed item. Omitted owned items return to storage. */
export function saveResidenceLayout(save:ResidenceSave,rows:Message[]):void{
 const next=structuredClone(save.layout??{}),seen=new Set<number>(),surfaces=new Set<number>();
 for(const item of Object.values(next))Object.assign(item,{pos_x:-1,pos_y:-1});
 for(const row of rows){const id=Number(row.id),item=next[id],type=item&&typeOf(item.templateId);
  if(!item||seen.has(id)||![row.pos_x,row.pos_y,row.rotation].every(Number.isInteger)||row.pos_x< -1||row.pos_y< -1||row.pos_x>30||row.pos_y>30||row.rotation<0||row.rotation>3)throw new ResidenceError("Posição de móvel inválida.");
  seen.add(id);if(row.pos_x>=0&&row.pos_y>=0&&[1,2].includes(type!)){if(surfaces.has(type!))throw new ResidenceError("Selecione somente uma parede e um piso.");surfaces.add(type!);}Object.assign(item,{pos_x:row.pos_x,pos_y:row.pos_y,rotation:row.rotation});
 }
 save.layout=next;
}
/** Repair accumulated legacy surfaces, keeping the last selected non-default model. */
export function normalizeResidenceSurfaces(save:ResidenceSave):void{
 for(const type of [1,2]){const placed=Object.values(save.layout??{}).filter(i=>i.pos_x>=0&&i.pos_y>=0&&typeOf(i.templateId)===type);for(const item of placed.slice(0,-1))Object.assign(item,{pos_x:-1,pos_y:-1});}
}
