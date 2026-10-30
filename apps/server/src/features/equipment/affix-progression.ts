import type {Message} from "../../messages.js";
import {equipmentAffixPool,halidomPurificationCaps,halidomAffixPool} from "./requirements.js";
export const purificationCaps=[10,30,50,60,70,100] as const;
export const localAffixId=(cap:number,family:number,stars:number)=>1500000000+cap*10000+family*101+stars;
export function generateEquipmentAffixes(content:{skills:Message[];properties:Message[]}):{skills:Message[];properties:Message[]}{
 const properties=new Map(content.properties.map(p=>[Number(p.TemplateId),p]));
 const anchors=content.skills.filter(s=>Number(s.MasterType)===11305&&Number(s.Grades)===10);
 // Leadership exists in earlier ordinary gear. Use the same 83-point primary scale,
 // keeping the family available instead of losing it when migrating an existing item.
 const captain=content.skills.find(s=>Number(s.MasterType)===21108&&Number(s.SonType)===4&&Number(s.Grades)===10);
 if(anchors.length!==11||!captain)throw new Error("Referências de purificação incompletas");
 const references=[...anchors,captain],skills:Message[]=[],rows:Message[]=[];
 const existing=new Set(content.skills.map(s=>Number(s.TemplateId)));
 for(const cap of purificationCaps)for(const anchor of references){
  const family=Number(anchor.SonType),property=properties.get(Number(anchor.TemplateId))!;
  const fields=Object.keys(property).filter(k=>!["TemplateId","AddType"].includes(k)&&Number(property[k]));
  if(Number(property.AddType)!==1||fields.length!==1)throw new Error("Referência de atributo ambígua");
  const field=fields[0]!,base=family===4?83:Number(property[field]);
  for(let stars=1;stars<=cap;stars++){
   const id=localAffixId(cap,family,stars),value=Math.trunc(base*stars/10);
   if(existing.has(id))throw new Error("ID de purificação local duplicado");existing.add(id);
   // Advanced pools originally omit leadership. Keep inherited leadership resolvable
   // without adding it to their new-roll options.
   const pool=family===4&&cap>=60?1400001000+cap:equipmentAffixPool(cap);
   skills.push({...anchor,TemplateId:String(id),MasterType:String(pool),Grades:String(stars),TemplateName:String(anchor.TemplateName).replace(/\s*\+\s*\d+.*$/,` +${value}`),Parameter3:"0"});
   rows.push({...property,TemplateId:String(id),[field]:String(value)});
  }
 }
 return {skills,properties:rows};
}

export const localHalidomAffixId=(evolution:number,family:number,stars:number)=>1600000000+evolution*100000+family*1000+stars;
/** Preserve every recovered value; extend beyond its last star at the same average value per star. */
export function generateHalidomAffixes(content:{skills:Message[];properties:Message[]}):{skills:Message[];properties:Message[]}{
 const properties=new Map(content.properties.map(p=>[Number(p.TemplateId),p]));
 const skills:Message[]=[],rows:Message[]=[];
 for(let evolution=1;evolution<=8;evolution++){
  const pool=[11203,11204,11205,11206,11206,11206,11206,11207][evolution-1]!;
  const source=content.skills.filter(s=>Number(s.MasterType)===pool);
  const families=[...new Set(source.map(s=>Number(s.SonType)))];
  if(families.length!==12)throw new Error("Referências de Armadura/Criatura incompletas");
  for(const family of families){
   const original=source.filter(s=>Number(s.SonType)===family).sort((a,b)=>Number(a.Grades)-Number(b.Grades));
   const anchor=original.at(-1)!,lastStars=Number(anchor.Grades),property=properties.get(Number(anchor.TemplateId))!;
   const fields=Object.keys(property).filter(k=>!["TemplateId","AddType"].includes(k)&&Number(property[k]));
   if(Number(property.AddType)!==1||fields.length!==1)throw new Error("Referência de Armadura/Criatura ambígua");
   const field=fields[0]!;
   for(let stars=1;stars<=halidomPurificationCaps[evolution-1]!;stars++){
    const recovered=original.find(s=>Number(s.Grades)===stars),base=recovered??anchor;
    const row=properties.get(Number(base.TemplateId))!;
    const value=recovered?Number(row[field]):Math.trunc(Number(property[field])*stars/lastStars);
    const id=localHalidomAffixId(evolution,family,stars);
    skills.push({...base,TemplateId:String(id),MasterType:String(halidomAffixPool(evolution)),Grades:String(stars),TemplateName:String(base.TemplateName).replace(/\s*\+\s*\d+.*$/,` +${value}`),Parameter3:"0"});
    rows.push({...row,TemplateId:String(id),[field]:String(value)});
   }
  }
 }
 return {skills,properties:rows};
}
