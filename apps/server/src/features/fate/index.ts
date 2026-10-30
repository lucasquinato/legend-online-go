import {readFileSync} from "node:fs";
import {join} from "node:path";
import {randomInt} from "node:crypto";
import {projectRoot} from "../../config.js";
import {encodeMessage,decodeMessage,typeName,type Message} from "../../messages.js";
import type {CityState,CityPacket} from "../../city-state.js";
import type {AttributeState,AttributeSource} from "../../attributes.js";
import {InventoryError,type Inventory,inventoryUpdates} from "../../inventory.js";
import {currencyBalance,type CurrencyLedger} from "../currencies/index.js";
import {gameDay} from "../../game-clock.js";
export const fateData=JSON.parse(readFileSync(join(projectRoot,"reference/fate/content.json"),"utf8")) as {upgrades:Message[];skills:Message[];properties:Message[];buffers:Message[];configs:Message[]};
export const fateLines=[{type:2000,upgrade:26,item:208024},{type:2200,upgrade:106,item:211001},{type:2100,upgrade:39,item:3300101}];
export const fateCurve=fateData.upgrades.filter(r=>Number(r.Types)===26).sort((a,b)=>Number(a.Grades)-Number(b.Grades));
export const fateTotalXP=fateCurve.reduce((n,r)=>n+Number(r.Data),0);
export function fateLevel(xp:number):number{let level=0;for(const row of fateCurve.filter(r=>Number(r.Grades)>0)){if(xp<Number(row.Data))break;xp-=Number(row.Data);level=Number(row.Grades);}return level;}
export function fateBonuses(type:number,level:number):Record<string,number>{
  if(type===2000){const value=Math.floor(14000*level/30);return{total_phy_attack:value,total_magic_attack:value,total_phy_defence:value,total_magic_defence:value,total_live:Math.floor(140000*level/30)};}
  if(type===2200){const value=(level<=20?150*level:3000+200*(level-20))*2.8;return{total_strength:Math.round(value),total_tenacity:Math.round(value)};}
  return{total_stunAttr:level*1000};
}
export interface FateSave {version:1;day:string;lines:{type:number;xp:number;turns:number}[]}
interface Context {readonly state:CityState;readonly saved:{fate?:FateSave;attributes?:AttributeState;battle?:{finished:boolean}};userId:number;ledger:CurrencyLedger;inventory():Inventory;now():number;persist():void;atomic<T>(action:()=>T):T}
export class FateFeature{
  constructor(private c:Context,private roll=(max:number)=>randomInt(max)){}
  get enabled(){return Number(this.c.state.player.grades)>=55;}
  get save():FateSave{const day=gameDay(this.c.now());const save=this.c.saved.fate??={version:1,day,lines:fateLines.map(l=>({type:l.type,xp:0,turns:0}))};if(save.day!==day){save.day=day;save.lines.forEach(l=>l.turns=0);}return save;}
  packets():CityPacket[]{return[{opcode:4544,body:encodeMessage(typeName("fate.FateListMsg"),{fateInfo:this.enabled?this.save.lines.map((l,i)=>{const level=fateLevel(l.xp),skill=fateData.skills.find(r=>Number(r.SonType)===l.type&&Number(r.Grades)===level)!;return{template_id:Number(skill.TemplateId),fate_types:l.type,total_gp:l.xp,grades:level,turn_count:l.turns,index:i+1,property1:"",property2:""};}):[]}).toString("base64")}];}
  synchronize():void{
    const source:AttributeSource={kind:"permanent",evidence:"local-balance",values:{},combatModifiers:[]};
    if(this.enabled)for(const line of this.save.lines){const level=fateLevel(line.xp);for(const[k,v]of Object.entries(fateBonuses(line.type,level)))source.values[k]=(source.values[k]??0)+v;
      if(level)source.combatModifiers!.push({kind:line.type===2000?"fateIgnoreDefence":line.type===2200?"fateReduction":"fateReflect",origin:{instanceId:line.type,templateId:line.type,bufferId:(line.type===2000?2000:line.type===2200?2200:2300)+level,slot:fateLines.findIndex(l=>l.type===line.type)},level:1,refinement:0,value:0,percent:level,chance:20});
    }
    this.c.saved.attributes!.sources.fate=source;
  }
  handle(op:number,body:Buffer):CityPacket[]|undefined{
    if(![8626,8627,8628].includes(op))return;
    if(op===8628)return this.packets();
    if(!this.enabled)throw new InventoryError("Proteção do Destino liberada no nível 55");
    if(this.c.saved.battle&&!this.c.saved.battle.finished)throw new InventoryError("Finalize a batalha antes de alterar o Destino");
    const r=decodeMessage(typeName("fate.FateEditMsg"),body);
    return this.c.atomic(()=>{
      const before=structuredClone(this.c.state.items);let result:CityPacket[]=[];
      if(op===8626){const index=fateLines.findIndex(l=>l.type===r.skill_sonType);if(index<0)throw new InventoryError("Linha do Destino inválida");
        const line=this.save.lines[index]!,count=Number(r.use_itemCount);if(!Number.isSafeInteger(count)||count<1)throw new InventoryError("Quantidade de materiais inválida");
        const used=Math.min(count,fateTotalXP-line.xp);if(used<=0)throw new InventoryError("Destino já está no nível máximo");
        this.c.inventory().consumeTemplate(fateLines[index]!.item,used);line.xp+=used;
      }else{
        const index=Number(r.index)-1,turns=Number(r.turn_num),pay=Number(r.pay_type??1);if(!Number.isInteger(index)||index<0||index>2||![1,10].includes(turns)||![1,2].includes(pay))throw new InventoryError("Giro do Destino inválido");
        if(r.is_disable!==undefined&&![false,true,0,1].includes(r.is_disable))throw new InventoryError("Opção de giro inválida");
        const line=this.save.lines[index]!;let cost=0;for(let n=0;n<turns;n++){const paid=line.turns+n;cost+=paid===0?0:Math.min(100,paid*10);if(r.is_disable)cost+=120;}
        const bound=pay===2?Math.min(cost,currencyBalance(this.c.state,"boundDiamonds")):0;
        if(cost)this.c.ledger.changeMany(this.c.state,this.c.userId,{...(bound?{boundDiamonds:-bound}:{}),...(cost>bound?{diamonds:-(cost-bound)}:{})},"fate:spin");
        const table=r.is_disable?[[6,500000],[8,357143],[20,142857]]:[[2,400],[4,250],[6,175],[8,125],[20,50]];
        const counts:number[]=[];for(let n=0;n<turns;n++){let pick=this.roll(table.reduce((n,r)=>n+r[1]!,0));let count=0;for(const[v,w]of table){pick-=w!;if(pick<0){count=v!;break;}}counts.push(count);}
        this.c.inventory().add({template_id:fateLines[index]!.item,bag_type:1,object_id:0,user_id:this.c.userId,bind:1,exist:1,pos:0},counts.reduce((n,v)=>n+v,0));line.turns+=turns;
        result=[{opcode:4545,body:encodeMessage(typeName("fate.FateEditMsg"),{is_success:true,turn_num:turns,curr_count:line.turns,count:counts,index:index+1,param2:"1"}).toString("base64")}];
      }
      this.c.persist();return[...this.packets(),{opcode:115,message:{moved:inventoryUpdates(before,this.c.state.items)}},...[3,113,150].map(opcode=>({opcode,message:{}})),...result];
    });
  }
}
