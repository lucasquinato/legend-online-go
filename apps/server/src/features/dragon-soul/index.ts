import {readFileSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../../config.js";
import {encodeMessage,decodeMessage,typeName,type Message} from "../../messages.js";
import type {CityState,CityPacket} from "../../city-state.js";
import type {AttributeState,AttributeSource} from "../../attributes.js";
import {InventoryError,type Inventory,inventoryUpdates} from "../../inventory.js";

export const dragonData=JSON.parse(readFileSync(join(projectRoot,"reference/dragon-soul/content.json"),"utf8")) as {upgrades:Message[];properties:Message[]};
export const dragonPolicy={commonItem:208032,holyItem:208550,xpPerItem:1,heartTransitionCost:0,awakeningCost:0,quickFeed:"fill-next-step",percentBasis:"central-character-layer",elementalEffectsEnabled:false} as const;
export interface DragonSoulSave {version:1;type:101|102|153;grade:number;xp:number}
interface Context {readonly state:CityState;readonly saved:{dragonSoul?:DragonSoulSave;attributes?:AttributeState;battle?:{finished:boolean}};inventory():Inventory;persist():void;atomic<T>(action:()=>T):T}
export function dragonRow(type:number,grade:number):Message|undefined{return dragonData.upgrades.find(r=>Number(r.Types)===type&&Number(r.Grades)===grade);}
export function commonDragonCap(level:number):number{return level<40?0:Math.min(5,Math.floor((level-40)/10)+1);}
export function remainingDragonMaterials(save:DragonSoulSave):{common:number;holy:number}{
  const cost=(type:number,grade:number)=>dragonData.upgrades.filter(r=>Number(r.Types)===type&&Number(r.Grades)>grade).reduce((s,r)=>s+Number(r.Data),0);
  return {common:save.type===101?Math.max(0,cost(101,save.grade)+cost(102,1)-save.xp):save.type===102?Math.max(0,cost(102,save.grade)-save.xp):0,holy:save.type===153?Math.max(0,cost(153,save.grade)-save.xp):cost(153,0)};
}
const propertyFields:Record<string,string>={Attack:"total_phy_attack",MagicAttack:"total_magic_attack",Defence:"total_phy_defence",MagicDefence:"total_magic_defence",Live:"total_live",ForceHit:"total_force_hit",Parry:"total_parry",Penetrate:"total_penetrate"};
const elements=["wind","water","fire","elect","light","dark"];
export function dragonSource(save:DragonSoulSave):AttributeSource{
  const source:AttributeSource={kind:"permanent",evidence:"recovered-table",values:{},percentages:{},elementalReductions:{}};
  const add=(type:number,max:number)=>{for(const row of dragonData.upgrades.filter(r=>Number(r.Types)===type&&Number(r.Grades)>0&&Number(r.Grades)<=max)){
    const prop=dragonData.properties.find(p=>Number(p.TemplateId)===Number(row.ActiveObject));if(!prop)continue;
    const destination=Number(prop.AddType)===1?source.values:source.percentages!;
    for(const[field,key]of Object.entries(propertyFields))destination[key]=(destination[key]??0)+Number(prop[field]??0);
  }};
  add(101,save.type===101?save.grade:5);if(save.type!==101)add(102,save.type===102?save.grade:8);
  if(save.type===153){
    const values=String(dragonRow(153,save.grade)?.TemplateName??"0,0,0,0,0,0").split(",").map(Number);
    const fields=[["total_force_hit"],["total_parry"],["total_penetrate"],["total_live"],["total_phy_defence","total_magic_defence"],["total_phy_attack","total_magic_attack"]];
    fields.forEach((keys,i)=>keys.forEach(key=>source.values[key]=(source.values[key]??0)+(values[i]??0)*(i===3?50:10)));
    elements.forEach((element,i)=>{if(save.grade>=61+i*60)(source.elementalReductions as Record<string,number>)[element]=10;});
    ["wind_water","fire_elect","light_dark"].forEach((element,i)=>{if(save.grade>=121+i*120)(source.elementalReductions as Record<string,number>)[element]=10;});
  }
  // These are stored character attributes, deliberately not combat modifiers or resistance points.
  return source;
}
export class DragonSoulFeature{
  constructor(private c:Context){}
  get save():DragonSoulSave{return this.c.saved.dragonSoul??={version:1,type:101,grade:0,xp:0};}
  get level(){return Number(this.c.state.player.grades);}
  packets():CityPacket[]{const s=this.save;return[{opcode:4555,body:encodeMessage(typeName("fate.FateListMsg"),{fateInfo:[{template_id:0,fate_types:s.type,grades:s.grade,total_gp:s.xp}]}).toString("base64")}];}
  synchronize():void{
    const s=this.save;if(!dragonRow(s.type,s.grade)||!Number.isSafeInteger(s.xp)||s.xp<0)throw new Error("Estado da Alma do Dragão inválido");
    this.c.saved.attributes!.sources.dragonSoul=this.level>=40?dragonSource(s):{kind:"permanent",evidence:"recovered-table",values:{}};
  }
  private heart():void{const s=this.save;if(this.level<80||s.type!==101||s.grade!==5)throw new InventoryError("O Coração do Dragão requer nível 80 e Alma do Dragão (Combate)");s.type=102;s.grade=1;s.xp=0;}
  handle(op:number,body:Buffer):CityPacket[]|undefined{
    if(![8641,8642,8643,9689].includes(op))return;
    if(op===8642)return this.packets();
    if(this.level<40)throw new InventoryError("Alma do Dragão liberada no nível 40");
    if(this.c.saved.battle&&!this.c.saved.battle.finished)throw new InventoryError("Finalize a batalha antes de evoluir a Alma do Dragão");
    return this.c.atomic(()=>{
      const before=structuredClone(this.c.state.items),s=this.save;
      if(op===9689){if(this.level<80||s.type!==102||s.grade!==8)throw new InventoryError("Despertar Sagrado requer nível 80 e Coração do Dragão nível 8");s.type=153;s.grade=0;s.xp=0;}
      else if(op===8643){if(s.type===101)this.heart();}
      else{
        const r=decodeMessage(typeName("fate.FateEditMsg"),body),mode=Number(r.use_itemCount);if(![1,2].includes(mode))throw new InventoryError("Modo de alimentação inválido");
        if(s.type===101&&s.grade>=commonDragonCap(this.level))throw new InventoryError(`Próxima evolução da Alma do Dragão liberada no nível ${Math.min(80,40+s.grade*10)}`);
        const next=dragonRow(s.type,s.grade+1);if(!next)throw new InventoryError("Alma do Dragão já está no nível máximo");
        const inventory=this.c.inventory(),item=s.type===153?dragonPolicy.holyItem:dragonPolicy.commonItem,need=Number(next.Data)-s.xp;
        if(!Number.isSafeInteger(need)||need<=0)throw new Error("Curva da Alma do Dragão inválida");
        const count=s.type===153?need:mode===1?1:Math.min(need,inventory.countTemplate(item));
        if(count<=0)throw new InventoryError("Almas do Dragão insuficientes");inventory.consumeTemplate(item,count);s.xp+=count;
        if(s.xp===Number(next.Data)){s.grade++;s.xp=0;if(s.type===101&&s.grade===5)this.heart();}
      }
      this.c.persist();return[...this.packets(),{opcode:115,message:{moved:inventoryUpdates(before,this.c.state.items)}},...[3,113,150,131].map(opcode=>({opcode,message:{}}))];
    });
  }
}
