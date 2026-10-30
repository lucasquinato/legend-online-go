import {inflateSync} from "node:zlib";
import {encodeClientTableBundle} from "../../client-table-bundle.js";
import {fateBonuses,fateData} from "./index.js";
const esc=(v:unknown)=>String(v).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
export function fateDescription(type:number,level:number):string{
  if(!level)return "";const b=fateBonuses(type,level);
  if(type===2000)return `ATQ +${b.total_phy_attack}<br>MAG +${b.total_magic_attack}<br>DEF +${b.total_phy_defence}<br>RES +${b.total_magic_defence}<br>Vida Máx. +${b.total_live}<br>PVP: após atacar, 20% de chance de reduzir em ${level}% a defesa e resistência do alvo para o próximo ataque recebido.`;
  if(type===2200)return `Intensidade +${b.total_strength}<br>Tenacidade +${b.total_tenacity}<br>PVP: após receber ataque, 20% de chance de obter redução de ${level}% do dano do próximo ataque. Intensidade e tenacidade ainda sem efeito próprio de combate.`;
  return `Determinação +${b.total_stunAttr}<br>PVP: após receber ataque, 20% de chance de refletir ${level}% do dano do próximo ataque. Pontos de determinação ainda sem efeito próprio de combate.`;
}
/** Only the advanced curve, destiny descriptions/properties and destiny buffer icons change. */
export function localSoulFateTables(raw:Buffer):Buffer{
  const data=inflateSync(raw.subarray(4)),parts=[data.subarray(0,4)];let pos=4;
  while(pos<data.length){const start=pos,n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;const length=data.readUInt32BE(pos);pos+=4;let body=data.subarray(pos,pos+length);pos+=length;
    if(name==="UpGradeTempInfos"){const extra=Array.from({length:20},(_,i)=>`<UpGradeTempInfo Id="${30181+i}" Types="104" TemplateId="0" TemplateName="" Grades="${81+i}" Data="720" ActiveObject="0"/>`).join("");body=Buffer.from(body.toString().replace(/<\/[^>]+>\s*$/,c=>extra+c));}
    if(name==="SkillTempInfos")body=Buffer.from(body.toString().replace(/<SkillTempInfo\s+[^>]*\/>/g,row=>{
      const id=Number(/\bTemplateId="(\d+)"/.exec(row)?.[1]),skill=fateData.skills.find(s=>Number(s.TemplateId)===id);if(!skill)return row;
      const type=Number(skill.SonType),level=Number(skill.Grades);return row.replace(/TemplateName="[^"]*"/,`TemplateName="${type===2000?"Destruição":type===2200?"Tenacidade":"Determinação"}"`).replace(/Description="[^"]*"/,`Description="${esc(fateDescription(type,level))}"`);
    }));
    if(name==="SkillPropertyTempInfos")body=Buffer.from(body.toString().replace(/<SkillPropertyTempInfo\s+[^>]*\/>/g,row=>{
      const id=Number(/\bTemplateId="(\d+)"/.exec(row)?.[1]),skill=fateData.skills.find(s=>Number(s.TemplateId)===id);if(!skill||!Number(skill.Grades))return row;
      const b=fateBonuses(Number(skill.SonType),Number(skill.Grades)),map:Record<string,string>={total_phy_attack:"Attack",total_magic_attack:"MagicAttack",total_phy_defence:"Defence",total_magic_defence:"MagicDefence",total_live:"Live",total_strength:"Strength",total_tenacity:"Tenacity",total_stunAttr:"StunAttr"};
      return `<SkillPropertyTempInfo TemplateId="${id}" AddType="1" ${Object.entries(b).map(([k,v])=>`${map[k]}="${v}"`).join(" ")}/>`;
    }));
    if(name==="SkillBufferTempInfos")body=Buffer.from(body.toString().replace(/<SkillBufferTempInfo\s+[^>]*\/>/g,row=>{
      const id=Number(/\bId="(\d+)"/.exec(row)?.[1]);if(!fateData.buffers.some(r=>Number(r.Id)===id))return row;
      const type=Math.floor(id/100),icon=type===20||type===21?"/skill_fate01.png":type===22?"/skill_fate03.png":"/skill_fate02.png";
      const level=id%100,label=type===20?`Defesa física reduzida em ${level}% para o próximo ataque recebido.`:type===21?`Resistência mágica reduzida em ${level}% para o próximo ataque recebido.`:type===22?`Reduz em ${level}% o dano do próximo ataque recebido.`:`Reflete ${level}% do dano do próximo ataque recebido.`;
      return row.replace(/Icon="[^"]*"/,`Icon="${icon}"`).replace(/BufferName="[^"]*"/,`BufferName="${esc(label)}"`);
    }));
    const size=Buffer.alloc(4);size.writeUInt32BE(body.length);parts.push(data.subarray(start,start+1+n),size,body);
  }return encodeClientTableBundle(Buffer.concat(parts));
}
