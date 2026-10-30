import {readFileSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../../config.js";
import {InventoryError,itemTemplate,type Inventory} from "../../inventory.js";
import type {Message} from "../../messages.js";
import type {AttributeSource} from "../../attributes.js";
import {refinementBonus} from "./refinement.js";
import {advancedSoulPercent} from "../soul-seal/index.js";

const content:{gems:number[];recipes:Message[];accessories:Message[];shops:Message[];upgrades:Message[];fashionSoul:number}=JSON.parse(readFileSync(join(projectRoot,"reference/equipment/gems.json"),"utf8"));
export const equipmentGems=new Set(content.gems);
export const gemRecipes=new Map(content.recipes.map(r=>[Number(r.Id),r]));
export const accessoryRecipes=new Map(content.accessories.map(r=>[Number(r.Id),r]));
export const drillOffers=content.shops;
export const SOUL_CRYSTAL=208014,DRILL=208004;
export const soulLevels=new Map(content.upgrades.filter(r=>Number(r.Types)===15).map(r=>[Number(r.Grades),Number(r.Data)]));
export const SOUL_MAX=Math.max(...soulLevels.keys());
export const fashionSoulTemplate=content.fashionSoul;
const fields:Record<string,string>={Attack:"phy_attack",MagicAttack:"magic_attack",Defence:"phy_defence",MagicDefence:"magic_defence",ForceHit:"force_hit",Live:"live",Conat:"conat_army",Captain:"captain",Parry:"parry"};
const socketEquipment=(item:Message)=>Number(itemTemplate(item.template_id)?.MasterType)===1&&[101,103,104,106,107,108,117,118].includes(Number(itemTemplate(item.template_id)?.SonType));
/** Minimum socket count is a gameplay rule, not a replacement for existing perforations. */
export function ensureEquipmentSockets(item:Message):void{
 if(!socketEquipment(item))return;
 const count=Number(itemTemplate(item.template_id)!.SonType)===101?2:1;
 for(let n=1;n<=4;n++)if(item[`join_${n}`]===undefined||item[`join_${n}`]===null||Number(item[`join_${n}`])<0)item[`join_${n}`]=n<=count?0:-1;
}
export function soulPercent(grade:number):number{
 if(!Number.isInteger(grade)||grade<0||grade>SOUL_MAX)throw new InventoryError("Nível do Selo da Alma inválido");
 // GoodsHelp from the pinned d41294b0 core: +400% at the ordinary maximum.
 return grade<=50?grade*4:grade<=70?(grade-17)*6+2:(grade-50)*8+160;
}
export function gemContribution(item:Message,grade=0,refinementGrade=0,advancedGrade=0):AttributeSource|undefined{
 if(!socketEquipment(item))return;
 const values:Record<string,number>={},percent=grade>=80&&advancedGrade>=80?advancedSoulPercent(advancedGrade):soulPercent(grade);
 for(let n=1;n<=4;n++){
  const id=Number(item[`join_${n}`]??-1);if(id<=0)continue;
  if(!equipmentGems.has(id))throw new InventoryError(`Gema equipada desconhecida: ${id}`);
  const t=itemTemplate(id)!;
  for(const [field,name]of Object.entries(fields)){const base=Number(t[field]??0),full=base+Math.trunc(base*percent/100);if(base)values[`total_${name}`]=(values[`total_${name}`]??0)+full+refinementBonus(full,refinementGrade);}
 }
 return Object.keys(values).length?{kind:"equipment",evidence:"recovered-table",values,derivePrimary:true}:undefined;
}
export function remainingSoulCrystals(player:Message):number{
 const grade=Number(player.storeGrade??0),gp=Number(player.storeGp??0);soulPercent(grade);
 if(!Number.isSafeInteger(gp)||gp<0)throw new InventoryError("XP do Selo da Alma inválido");
 return Math.max(0,[...soulLevels].filter(([g])=>g>grade).reduce((sum,[,xp])=>sum+xp,0)-gp);
}
export function upgradeSoul(inventory:Inventory,player:Message,r:Message):number{
 const count=Number(r.count);if(Number(r.templateId)!==SOUL_CRYSTAL||!Number.isSafeInteger(count)||count<1)throw new InventoryError("Cristais de alma ou quantidade inválidos");
 const remaining=remainingSoulCrystals(player);if(!remaining)throw new InventoryError("O Selo da Alma já atingiu o nível máximo");
 const used=Math.min(count,remaining);inventory.consumeTemplate(SOUL_CRYSTAL,used);
 let grade=Number(player.storeGrade??0),gp=Number(player.storeGp??0)+used;
 while(grade<SOUL_MAX&&gp>=soulLevels.get(grade+1)!){gp-=soulLevels.get(grade+1)!;grade++;}
 player.storeGrade=grade;player.storeGp=grade===SOUL_MAX?0:gp;
 return used;
}
export function synthesizeGem(inventory:Inventory,r:Message,level:number,userId:number,debit:(gold:number)=>void):number{
 const recipe=gemRecipes.get(Number(r.compose_id))??accessoryRecipes.get(Number(r.compose_id)),count=Number(r.compose_num);
 if(!recipe||!Number.isSafeInteger(count)||count<1||count>9999)throw new InventoryError("Receita ou quantidade de gemas inválida");
 if(Number(recipe.NeedMinLevel)>level)throw new InventoryError("Nível insuficiente para esta síntese");
 if(r.auto_buy||Number(recipe.IsLearn)||Number(recipe.NeedBuildingTemp))throw new InventoryError("Use os materiais disponíveis da receita de gemas");
 const consumed:Message[]=[];
 for(let n=1;n<=4;n++)if(Number(recipe[`Material${n}`])&&Number(recipe[`Count${n}`]))consumed.push(...inventory.consumeTemplate(Number(recipe[`Material${n}`]),Number(recipe[`Count${n}`])*count));
 debit(Number(recipe.NeedGold)*count);
 inventory.add({template_id:Number(recipe.NewMaterial),bag_type:1,object_id:0,pos:0,exist:1,bind:consumed.some(i=>i.bind)?1:0,used:0,user_id:userId,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1},Number(recipe.Counts)*count);
 return Number(recipe.NewMaterial);
}
function selectedEquipment(inventory:Inventory):Message{
 const item=inventory.items["0:0:0"];
 if(!item||!socketEquipment(item)||item.count!==1||item.is_locked)throw new InventoryError("Selecione um equipamento comum na forja");
 ensureEquipmentSockets(item);
 // Reuse inventory's expiry/protection checks without changing its identity/location.
 const clone=inventory.consume("0:0:0",1);inventory.items["0:0:0"]=clone;return clone;
}
const gemModel=(id:number,userId:number):Message=>({template_id:id,bag_type:1,object_id:0,pos:0,count:1,exist:1,bind:1,used:0,user_id:userId,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1});
const family=(id:number)=>{const t=itemTemplate(id)!;return `${t.SonType}:${t.Property1}:${t.Property2??0}`;};
export function insertGem(inventory:Inventory,r:Message,userId:number,debit:(gold:number)=>void):void{
 const item=selectedEquipment(inventory),slot=Number(r.mount_pos),bag=Number(r.bag_type),pos=Number(r.bag_pos);
 if(!Number.isInteger(slot)||slot<1||slot>4||![1,34].includes(bag)||!Number.isInteger(pos)||pos<0)throw new InventoryError("Encaixe ou origem de gema inválido");
 if(Number(item[`join_${slot}`])<0)throw new InventoryError("Perfure este encaixe antes de inserir uma gema");
 const source=inventory.items[`${bag}:0:${pos}`];if(!source||!equipmentGems.has(Number(source.template_id)))throw new InventoryError("Gema de equipamento inválida");
 for(let n=1;n<=4;n++)if(n!==slot&&Number(item[`join_${n}`])>0&&family(Number(item[`join_${n}`]))===family(source.template_id))throw new InventoryError("Não é possível inserir duas gemas da mesma família neste equipamento");
 const old=Number(item[`join_${slot}`]??0),id=Number(source.template_id);inventory.consume(`${bag}:0:${pos}`,1);
 if(old>0){debit(Number(itemTemplate(old)!.Property3));inventory.add(gemModel(old,userId),1);}
 item[`join_${slot}`]=id;item.bind=1;
}
export function socketOperation(inventory:Inventory,r:Message,userId:number,debit:(gold:number)=>void,buyDrill:()=>void):void{
 const item=selectedEquipment(inventory),slot=Number(r.hole_pos);
 if(!Number.isInteger(slot)||slot<1||slot>4)throw new InventoryError("Encaixe inválido");
 const id=Number(item[`join_${slot}`]);
 if(r.operate){
  if(id>=0)throw new InventoryError("Este encaixe já está aberto");
  if(!inventory.countTemplate(DRILL))buyDrill();
  inventory.consumeTemplate(DRILL,1);item[`join_${slot}`]=0;item.bind=1;
 }else{
  if(id<=0||!equipmentGems.has(id))throw new InventoryError("Não há gema neste encaixe");
  debit(Number(itemTemplate(id)!.Property3));inventory.add(gemModel(id,userId),1);item[`join_${slot}`]=0;
 }
}
