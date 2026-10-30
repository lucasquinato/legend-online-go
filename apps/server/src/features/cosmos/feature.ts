import { randomInt } from "node:crypto";
import type { AttributeState } from "../../attributes.js";
import { replaceAttributeContribution } from "../../attributes.js";
import type { CityPacket, CityState } from "../../city-state.js";
import type { Message } from "../../messages.js";
import { CurrencyLedger, currencyBalance } from "../currencies/index.js";
import { questClaimed } from "../quests/index.js";
import { astrologyPolicy, config, templates, cosmosQuests, quickLevels, advancedRecipes } from "./content.js";
import { cosmosAttributeSource } from "./attributes.js";
import { absorbXP, maximumLevel, transferableXP } from "./progression.js";
import { initialCosmos, type Cosmo, type CosmosSave } from "./state.js";
import { moves, packet, request, wireStar } from "./protocol.js";
import { cosmosVisible } from "./availability.js";
import { equipmentFamily, requiresSpecialSlot } from "./equipment.js";
import { advancedPolicy, refinementPlan, sacredRemainingXP } from "./advanced.js";

export class CosmosError extends Error {}
interface Context {
  readonly state: CityState;
  readonly saved: { cosmos?: CosmosSave; attributes?: AttributeState; battle?: { finished: boolean }; vip?: { level: number; expiresAt: number } };
  readonly userId: number;
  ledger: CurrencyLedger;
  now(): number;
  persist(): void;
  atomic<T>(action: () => T): T;
}
export class CosmosFeature {
  constructor(private readonly context: Context, private readonly roll = () => randomInt(1000000) / 1000000) {}
  get save(): CosmosSave { return this.context.saved.cosmos ??= initialCosmos(); }
  get level(): number { return Number(this.context.state.player.grades); }
  get available(): boolean { return this.level >= 18; }
  get all(): Cosmo[] { return Object.values(this.save.instances).filter(row=>cosmosVisible(templates.get(row.templateId))).sort((a,b) => a.bag - b.bag || a.pos - b.pos); }
  slotOpen(pos: number): boolean {
    return this.available && ((pos >= 0 && pos < Math.min(8, Math.floor(this.level / 10))) || (pos === 8 && this.level >= 60 && questClaimed(this.context.state, 1802)) || (pos === 9 && this.level >= 80));
  }
  synchronize(): void {
    const save = this.save;
    for (const star of Object.values(save.instances)) if (!cosmosVisible(templates.get(star.templateId))) {
      (save.suspended ??= {})[star.id] = structuredClone(star);
      delete save.instances[star.id];
    }
    Object.assign(this.context.state.player, { star_count: save.bagExtra, starpoint: save.points, startFree: save.free });
    if (this.context.saved.attributes) replaceAttributeContribution(this.context.saved.attributes, "cosmos", cosmosAttributeSource(save, pos => this.slotOpen(pos)));
  }
  at(bag: number, pos: number): Cosmo | undefined { return this.all.find(row => row.bag === bag && row.pos === pos); }
  private free(bag: 0 | 1): number {
    const capacity = bag === 0 ? 18 : 12 + this.save.bagExtra;
    for (let pos=0;pos<capacity;pos++) if (!this.at(bag,pos)) return pos;
    throw new CosmosError(bag === 0 ? "Recolha, venda ou absorva os resultados da astrologia." : "Mochila de Cosmos cheia.");
  }
  private require(bag: number, pos: number): Cosmo {
    const row = this.at(bag,pos); if (!row) throw new CosmosError("Cosmo não encontrado nesta posição."); return row;
  }
  /** Authoritative grant hook, shared by astrology/shop and future rewards. Never imports captured ownership. */
  grant(templateId: number, bag: 0 | 1 = 1): Cosmo {
    const row = templates.get(templateId);
    if (!row || (Number(row.Profile) === 8 && this.level < 80)) throw new CosmosError("Cosmo Sagrado exige nível 80.");
    if (!cosmosVisible(row)) throw new CosmosError("Este Cosmo está temporariamente indisponível.");
    const pos = this.free(bag), id = this.save.nextId++;
    const star: Cosmo = { id, templateId, bag, pos, level: 1, xp: 0, locked: false };
    this.save.instances[id] = star; return star;
  }
  private equipAllowed(star: Cosmo, slot: number): void {
    const row = templates.get(star.templateId)!;
    if (!this.slotOpen(slot)) throw new CosmosError(slot === 9 ? "Décimo slot exige nível 80." : "Slot de Cosmo ainda bloqueado por nível ou missão 1802.");
    if ([1,6].includes(Number(row.Profile)) || Number(row.NeedGrades) > this.level || (Number(row.Job) !== 0 && Number(row.Job) !== Number(this.context.state.army.job))) throw new CosmosError("Este Cosmo não pode ser equipado por este personagem.");
    if (requiresSpecialSlot(row) && slot < 8) throw new CosmosError("Cosmo composto exige um slot avançado.");
    if (this.all.some(other => other.bag === 2 && other.id !== star.id && other.pos !== slot && equipmentFamily(templates.get(other.templateId)!) === equipmentFamily(row))) throw new CosmosError(`Já existe um Cosmo desta família equipado: ${row.TemplateName}. Combinações diferentes de atributos podem coexistir.`);
  }
  private move(r: Message): void {
    const fromBag = Number(r.begin_star_type), toBag = Number(r.end_star_type), from = Number(r.begin_pos);
    let to = Number(r.end_pos);
    if (![0,1,2,3].includes(fromBag) || ![1,2,3].includes(toBag)) throw new CosmosError("Bolsa de Cosmos inválida.");
    if ((fromBag===3||toBag===3)&&this.level<80) throw new CosmosError("Elevação de Cosmos exige nível 80.");
    const star = this.require(fromBag,from);
    // The original client sends position zero when returning an equipped selection.
    if(fromBag===3&&toBag===2&&to===0&&star.previousBag===2)to=star.previousPos??0;
    const target = this.at(toBag,to);
    if (star.id === target?.id) return;
    if (r.count !== undefined && Number(r.count) !== 1) throw new CosmosError("Cosmos são instâncias individuais.");
    if (r.eat) {
      if(fromBag===3||toBag===3)throw new CosmosError("A área de elevação não permite absorção comum.");
      if (!target || fromBag === 2) throw new CosmosError("Retire o Cosmo equipado antes de consumi-lo.");
      this.absorb(target,star); return;
    }
    if (toBag === 1 && (!Number.isInteger(to) || to < 0 || to >= 12 + this.save.bagExtra)) throw new CosmosError("Posição da mochila indisponível.");
    if (toBag === 2) this.equipAllowed(star,to);
    if(toBag===3) {
      const row=templates.get(star.templateId)!;
      if(to!==0||![1,2].includes(fromBag)||!(Number(row.Profile)===8||(Number(row.Profile)===7&&star.level===10&&advancedRecipes.some(recipe=>Number(recipe.Material1)===star.templateId))))throw new CosmosError("Selecione um Cosmo elegível e uma área de elevação vazia.");
      star.previousBag=fromBag as 1|2;
      star.previousPos=from;
    }
    if(fromBag===3&&target)throw new CosmosError("Retire o Cosmo da elevação para uma posição vazia.");
    if (target && fromBag === 0) throw new CosmosError("Recolha o Cosmo em uma posição vazia.");
    // Validate the reverse leg too; swaps may not bypass family or advanced-slot rules.
    if (target && fromBag === 2) {
      const oldBag = star.bag, oldPos = star.pos;
      star.bag = toBag as 1 | 2; star.pos = to;
      try { this.equipAllowed(target,from); } finally { star.bag=oldBag;star.pos=oldPos; }
    }
    if (target) { target.bag = fromBag as 1 | 2; target.pos=from; delete target.previousBag; delete target.previousPos; }
    star.bag=toBag as 1 | 2 | 3;star.pos=to;
    if(toBag!==3){delete star.previousBag;delete star.previousPos;}
  }
  private refine(r:Message):void {
    const pos=Number(r.pos),attempts=Number(r.type);
    if(!Number.isInteger(pos)||pos<0||pos>=8||!this.slotOpen(pos))throw new CosmosError("Refinação disponível apenas em slots comuns já liberados.");
    if(![1,10].includes(attempts))throw new CosmosError("Escolha uma ou dez tentativas de refinação.");
    const next=refinementPlan(this.save.slots[pos]!,attempts);
    if(!next.attempts)throw new CosmosError("Slot já está no grau máximo de refinação.");
    this.context.ledger.change(this.context.state,this.context.userId,"gold",-next.attempts*advancedPolicy.refinementGold,"cosmos:slot-refinement");
    this.save.slots[pos]={grade:next.grade,xp:next.xp};
  }
  private grow(r:Message):void {
    if(this.level<80)throw new CosmosError("Elevação e evolução de Cosmos Sagrados exigem nível 80.");
    const star=this.require(3,0),op=Number(r.op_type),profile=Number(templates.get(star.templateId)!.Profile);
    if(op===0) {
      const recipe=advancedRecipes.find(row=>Number(row.Material1)===star.templateId);
      if(profile!==7||star.level!==10||!recipe)throw new CosmosError("A elevação exige um Cosmo elegível de qualidade 7 no nível 10.");
      const cost=Number(recipe.NeedGold);
      if(cost)this.context.ledger.change(this.context.state,this.context.userId,"gold",-cost,"cosmos:sacred-elevation");
      star.templateId=Number(recipe.NewMaterial);star.level=1;star.xp=0;
    }else if(op===1) {
      const count=Number(r.item_count);
      if(profile!==8||!Number.isSafeInteger(count)||count<=0)throw new CosmosError("Selecione um Sagrado e uma quantidade válida de Pó da Ilusão.");
      const remaining=sacredRemainingXP(star.level,star.xp);
      if(!remaining)throw new CosmosError("Cosmo Sagrado já está no nível máximo.");
      const used=Math.min(count,Math.ceil(remaining/advancedPolicy.dustXp));
      this.context.ledger.change(this.context.state,this.context.userId,"illusionDust",-used,"cosmos:sacred-growth");
      absorbXP(star,Math.min(remaining,used*advancedPolicy.dustXp));
    }else throw new CosmosError("Operação de evolução inválida.");
  }
  private absorb(target: Cosmo, victim: Cosmo): void {
    const t = templates.get(target.templateId)!, v = templates.get(victim.templateId)!;
    if (target.id === victim.id || victim.locked || victim.bag === 2 || [1,8].includes(Number(v.Profile)) || [1,6,8].includes(Number(t.Profile))) throw new CosmosError("Absorção inválida: verifique cadeado, material e qualidade.");
    absorbXP(target,transferableXP(victim)); delete this.save.instances[victim.id];
  }
  private quickAbsorb(bag: number, pos: number, maxQuality = 7): void {
    if (![0,1].includes(bag)) throw new CosmosError("Bolsa inválida para absorção em lote.");
    const target = this.require(bag,pos);
    if (target.locked || target.level >= maximumLevel(Number(templates.get(target.templateId)!.Profile))) throw new CosmosError("Escolha um Cosmo desbloqueado abaixo do nível máximo.");
    for (const victim of this.all.filter(row => row.bag === bag && row.id !== target.id && !row.locked && row.level < 10 && Number(templates.get(row.templateId)!.Profile) > 1 && Number(templates.get(row.templateId)!.Profile) <= maxQuality)) this.absorb(target,victim);
  }
  private sale(star: Cosmo): void {
    if (star.locked || star.bag !== 0 || star.level !== 1 || star.xp !== 0) throw new CosmosError("Venda disponível apenas para resultados não evoluídos e desbloqueados.");
    this.context.ledger.change(this.context.state,this.context.userId,"gold",Number(templates.get(star.templateId)!.SellGold),"cosmos:sale");
    delete this.save.instances[star.id];
  }
  private pick(r: Message): void {
    const pos = Number(r.dropsite), way = Number(r.way ?? 0);
    if (pos === -2) {
      const rows=this.all.filter(row=>row.bag===0 && Number(templates.get(row.templateId)!.Profile)>1);
      if (rows.length > 12 + this.save.bagExtra - this.all.filter(row=>row.bag===1).length) throw new CosmosError("Mochila de Cosmos sem espaço para recolher todos.");
      for (const row of rows) { const free=this.free(1);row.bag=1;row.pos=free; }
    } else if (pos === -1) {
      if (!Number.isInteger(way) || way < 1 || way > 7) throw new CosmosError("Filtro de venda inválido.");
      for (const row of this.all.filter(row=>row.bag===0 && !row.locked && row.level===1 && row.xp===0 && Number(templates.get(row.templateId)!.Profile)<=way)) this.sale(row);
    } else {
      const star=this.require(0,pos);
      if (way===2) this.sale(star);
      else if ([0,1].includes(way)) {
        if (Number(templates.get(star.templateId)!.Profile)===1) throw new CosmosError("Este resultado deve ser vendido.");
        const free=this.free(1);star.bag=1;star.pos=free;
      } else throw new CosmosError("Operação de recolhimento inválida.");
    }
  }
  private vip(required: number): void {
    const vip=this.context.saved.vip;
    // Never inherit another account's captured VIP packet.
    if (!vip || vip.level < required || vip.expiresAt <= this.context.now()) throw new CosmosError(`Requer VIP ${required} ativo ou nível ${quickLevels[required-1]}.`);
  }
  private objective(type: 36 | 53): void {
    for(const definition of cosmosQuests){
      const id=Number(definition.template.TemplateId),quest=this.context.state.quests[id];
      if(!quest?.is_accept || questClaimed(this.context.state,id))continue;
      for(const [index,condition] of definition.conditions.entries())if(Number(condition.CondictionType)===type){
        const key=`condition_${index+1}`,goal=Number(condition.Para2);
        quest[key]=Math.min(goal,Number(quest[key]??0)+1);
      }
      quest.is_complete=definition.conditions.every((condition,index)=>Number(quest[`condition_${index+1}`]??0)>=Number(condition.Para2))?1:0;
    }
  }
  private draw(stage: number, enforceFloor = true): void {
    if (!Number.isInteger(stage) || stage<0 || stage>4 || this.save.stages[stage]!==1) throw new CosmosError("Bola de cristal não disponível.");
    this.free(0);
    const cost=config(`StarPickGold${stage}`);
    if (this.save.free>0) this.save.free--;
    else {
      if (enforceFloor && currencyBalance(this.context.state,"gold")<20000) throw new CosmosError("Astrologia requer ao menos 20.000 de ouro disponível.");
      this.context.ledger.change(this.context.state,this.context.userId,"gold",-cost,"cosmos:astrology");
    }
    const points=this.save.points+config(`StarPoint${stage}`);
    if(!Number.isSafeInteger(points)||points>2147483647)throw new CosmosError("Limite de pontos de astrologia atingido.");
    this.save.points=points;
    const eligible=[...templates.values()].filter(row=>cosmosVisible(row) && Number(row.MasterType)<17 && Number(row.NeedGrades)<=this.level);
    const weights=Object.fromEntries(Object.entries(astrologyPolicy.qualityWeights[stage]!).filter(([profile])=>eligible.some(row=>Number(row.Profile)===Number(profile))));
    const ticket=this.roll()*Object.values(weights).reduce((a,b)=>a+b,0);
    let sum=0, quality=1;
    for (const [profile,weight] of Object.entries(weights)) { sum+=weight;if(ticket<sum){quality=Number(profile);break;} }
    const pool=eligible.filter(row=>Number(row.Profile)===quality);
    const selected=pool[Math.min(pool.length-1,Math.floor(this.roll()*pool.length))];
    if (!selected) throw new CosmosError("Tabela de astrologia sem resultado elegível.");
    this.grant(Number(selected.TemplateId),0);
    this.objective(36);
    this.save.stages[stage]=0;this.save.stages[0]=1;
    if (stage<4 && this.roll()*100<astrologyPolicy.nextStageChance[stage]!) this.save.stages[stage+1]=1;
  }
  private auto(r: Message): void {
    if(this.level<quickLevels[1]!)this.vip(2);
    const budget=Number(r.golden), sell=Number(r.sell_max_quality), compose=Number(r.compose_max_quality);
    if (![100000,1000000,10000000].includes(budget) || ![sell,compose].every(n=>Number.isInteger(n)&&n>=1&&n<=7)) throw new CosmosError("Configuração de astrologia automática inválida.");
    if (currencyBalance(this.context.state,"gold")<20000 && this.save.free<=0) throw new CosmosError("Ouro insuficiente para astrologia.");
    let spent=0;
    for (let turn=0;turn<2600;turn++) {
      for (const row of this.all.filter(row=>row.bag===0 && !row.locked && row.level===1 && row.xp===0 && Number(templates.get(row.templateId)!.Profile)<=sell)) this.sale(row);
      const target=this.all.filter(row=>row.bag===0 && ![1,6,8].includes(Number(templates.get(row.templateId)!.Profile))).sort((a,b)=>Number(templates.get(b.templateId)!.Profile)-Number(templates.get(a.templateId)!.Profile)||b.level-a.level)[0];
      if(target && target.level<maximumLevel(Number(templates.get(target.templateId)!.Profile))) this.quickAbsorb(0,target.pos,compose);
      if(this.all.filter(row=>row.bag===0).length>=18) break;
      const stage=this.save.stages.lastIndexOf(1), cost=this.save.free>0?0:config(`StarPickGold${stage}`);
      if(spent+cost>budget || currencyBalance(this.context.state,"gold")<cost) break;
      this.draw(stage,false);spent+=cost;
    }
  }
  private exchange(r: Message): CityPacket {
    const id=Number(r.good_id), row=templates.get(id), cost=Number(row?.StarPoint ?? 0);
    if(!row || !cosmosVisible(row) || cost<=0 || Number(row.Profile)===8 || Number(row.NeedGrades)>this.level || this.save.points<cost) throw new CosmosError("Pontos insuficientes ou Cosmo indisponível para troca.");
    this.grant(id);this.save.points-=cost;return packet(4261,{good_id:id,result:1});
  }
  initialPackets(): CityPacket[] {
    const empty=initialCosmos();
    return [moves(empty,this.save,this.context.userId),this.randomPacket(4180),this.refinementPacket()];
  }
  private refinementPacket():CityPacket {return packet(4677,{additions:this.save.slots.map((slot,pos)=>({userId:this.context.userId,type:pos>7?1:0,pos,grade:pos<8?slot.grade:0,curGp:pos<8?slot.xp:0}))});}
  private randomPacket(opcode: number): CityPacket {
    return packet(opcode,{site:this.save.stages,starRand:this.all.filter(row=>row.bag===0).map(row=>({dropSite:row.pos,starInfo:wireStar(row,this.context.userId)}))});
  }
  handle(opcode: number, body: Buffer): CityPacket[] | undefined {
    if(![8267,8268,8269,8270,8325,8330,8331,8341,8772,8876,5182].includes(opcode)) return;
    if(opcode===8325) {this.synchronize();return this.initialPackets();}
    if(!this.available) throw new CosmosError("Cosmos são liberados no nível 18.");
    if(this.context.saved.battle && !this.context.saved.battle.finished) throw new CosmosError("Finalize a batalha antes de alterar os Cosmos.");
    let r: Message;
    try { r=request(opcode,body); } catch { throw new CosmosError("Pacote de Cosmos inválido."); }
    return this.context.atomic(()=>{
      const before=structuredClone(this.save), extra:CityPacket[]=[];
      if(opcode===8267)this.move(r);
      else if(opcode===8268)this.pick(r);
      else if(opcode===8269){const stage=Number(r.site);if(stage===-1){if(this.level<quickLevels[0]!)this.vip(1);this.draw(this.save.stages.lastIndexOf(1));}else this.draw(stage);}
      else if(opcode===8876)this.auto(r);
      else if(opcode===8270){
        if(this.save.bagExtra+config("Star_BagAdd")>6)throw new CosmosError("Limite de 18 posições desta interface atingido.");
        const pay=Number(r.payType ?? r.pay_type ?? 0);if(![0,1].includes(pay))throw new CosmosError("Pagamento inválido.");
        const price=config("Star_BagPrice"),bound=pay===0?Math.min(price,currencyBalance(this.context.state,"boundDiamonds")):0;
        this.context.ledger.changeMany(this.context.state,this.context.userId,{diamonds:-(price-bound),boundDiamonds:-bound},"cosmos:expand");this.save.bagExtra+=config("Star_BagAdd");
      }else if(opcode===8330){const row=this.require(Number(r.star_type),Number(r.pos));row.locked=!row.locked;if(row.locked)this.objective(53);}
      else if(opcode===8331)this.quickAbsorb(Number(r.bag_type??1),Number(r.pos));
      else if(opcode===8341)extra.push(this.exchange(r));
      else if(opcode===8772){this.refine(r);extra.push(this.refinementPacket());}
      else if(opcode===5182){this.grow(r);extra.push({opcode:4725,message:{}});}
      this.synchronize();this.context.persist();
      const after=this.save;
      const removed=Object.values(before.instances).filter(old=>old.bag===0 && (!after.instances[old.id] || after.instances[old.id]!.bag!==0));
      if(removed.length)extra.push(packet(4179,{starRand:removed.map(row=>({dropSite:row.pos}))}));
      if(Object.values(after.instances).some(row=>row.bag===0 && before.instances[row.id] && JSON.stringify(before.instances[row.id])!==JSON.stringify(row)))extra.push(this.randomPacket(4479));
      return [...extra,moves(before,after,this.context.userId),this.randomPacket(4180),{opcode:3,message:{}},{opcode:109,message:{}},{opcode:113,message:{}},{opcode:150,message:{}},{opcode:112,message:{}}];
    });
  }
  xml(ids = ""): string {
    const requested=ids && ids!=="0"?new Set(ids.split(",").map(Number)):undefined;
    return "<root>"+this.all.filter(row=>!requested||requested.has(row.id)).map(row=>`<Info id="${row.id}" tempId="${row.templateId}" templateId="${row.templateId}" userId="${this.context.userId}" objectId="${row.previousBag ?? 0}" oldBagType="${row.previousBag ?? 0}" pos="${row.pos}" isExist="true" bagType="${row.bag}" grade="${row.level}" gp="${row.xp}" isLock="${row.locked}" composeLock="${row.locked}"/>`).join("")+"</root>";
  }
}
