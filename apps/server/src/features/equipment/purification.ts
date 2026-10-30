import {randomInt} from "node:crypto";
import {Inventory,InventoryError,itemTemplate} from "../../inventory.js";
import type {Message} from "../../messages.js";
import {equipmentSkills,equipmentProperties,supportedEquipment as normalEquipment} from "./content.js";
export const REFRESH_LOCK=208027;
export interface PurificationProposal {itemId:number;templateId:number;before:number[];skills:number[];locks:boolean[];bind:boolean}
export type PurificationSave=Record<string,PurificationProposal>;
export const purificationCount=(quality:number):number=>[0,1,1,4,18,18,24,48][quality]??0;
export function selectedForgeEquipment(inventory:Inventory):Message{
 const item=inventory.items["0:0:0"];
 if(!item||!normalEquipment(item.template_id)||item.count!==1||item.is_locked)throw new InventoryError("Selecione um equipamento comum na forja");
 const checked=inventory.consume("0:0:0",1);inventory.items["0:0:0"]=checked;return checked;
}
const affixes=(item:Message)=>Array.from({length:5},(_,n)=>Number(item[`random_skill_${n+1}`]??0));
/** Buy only approved shortages; caller's transaction covers both currencies and the proposal. */
export function purifyEquipment(inventory:Inventory,save:PurificationSave,r:Message,buy:(template:number,count:number,payType:number)=>boolean,draw:(size:number)=>number=randomInt):PurificationProposal{
 const item=selectedForgeEquipment(inventory),t=itemTemplate(item.template_id)!,before=affixes(item),count=Number(t.RandomSkillCount);
 const locks=Array.isArray(r.lock)?r.lock.map(Boolean):[];
 if(count<1||count>5||locks.length>5||locks.some((v,n)=>v&&n>=count)||locks.filter(Boolean).length>=count||![0,2].includes(Number(r.bind_type??0))||![0,1].includes(Number(r.material_pay_type??r.$4?.value??0)))throw new InventoryError("Travas ou pagamento de purificação inválidos");
 while(locks.length<5)locks.push(false);
 const seen=new Set<number>();for(let n=0;n<count;n++)if(locks[n]){const skill=equipmentSkills.get(before[n]!);if(!skill||seen.has(Number(skill.SonType)))throw new InventoryError("Atributo travado inválido");seen.add(Number(skill.SonType));}
 const skills=[...before];
 for(let n=0;n<count;n++){
  if(locks[n])continue;
  const floor=Number(equipmentSkills.get(before[n]!)?.Grades??0),groups=new Map<number,number[]>();
  for(const [id,skill]of equipmentSkills)if(String(skill.MasterType)===String(t.Property7)&&Number(skill.Grades)>=floor&&equipmentProperties.has(id)&&!seen.has(Number(skill.SonType))){const family=Number(skill.SonType);groups.set(family,[...(groups.get(family)??[]),id]);}
  const families=[...groups.keys()];if(!families.length)throw new InventoryError("Não há atributos elegíveis sem reduzir as estrelas atuais");
  const family=families[draw(families.length)]!,choices=groups.get(family)!;skills[n]=choices[draw(choices.length)]!;seen.add(family);
 }
 let bound=false;
 const consume=(id:number,amount:number,unboundOnly=false)=>{
  if(!amount)return;
  const stacks=Object.entries(inventory.items).filter(([,i])=>i.template_id===id&&i.bag_type===1&&!i.object_id&&(!unboundOnly||!i.bind)&&!i.is_locked).sort(([,a],[,b])=>a.pos-b.pos);
  const available=stacks.reduce((sum,[,i])=>sum+i.count,0),missing=Math.max(0,amount-available);
  if(missing)bound=buy(id,missing,Number(r.material_pay_type??r.$4?.value??0))||bound;
  let left=amount-missing;for(const [key,i]of stacks){if(!left)break;const used=Math.min(left,i.count);bound=Boolean(inventory.consume(key,used).bind)||bound;left-=used;}
 };
 const material=Number(t.Refresh),need=purificationCount(Number(t.Profile));
 if(!material||!need)throw new InventoryError("Material de purificação indisponível");
 consume(material,need,Number(r.bind_type??0)===2);consume(REFRESH_LOCK,locks.filter(Boolean).length);
 const proposal:PurificationProposal={itemId:item.id,templateId:item.template_id,before,skills,locks,bind:bound};save[String(item.id)]=proposal;return proposal;
}
export function applyPurification(inventory:Inventory,save:PurificationSave):void{
 const item=selectedForgeEquipment(inventory),proposal=save[String(item.id)];
 if(!proposal||proposal.templateId!==item.template_id||JSON.stringify(proposal.before)!==JSON.stringify(affixes(item)))throw new InventoryError("Não existe uma proposta válida para este equipamento");
 proposal.skills.forEach((id,n)=>item[`random_skill_${n+1}`]=id);if(proposal.bind)item.bind=1;delete save[String(item.id)];
}
