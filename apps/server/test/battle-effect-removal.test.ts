import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEffect, createEngine, execute, makeActor, actorBuffers, type Effect } from "../src/features/battle/engine.js";
import { buffers } from "../src/features/battle/content.js";
import { effectCanBeRemoved } from "../src/features/battle/effect-removal.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";

function setup() {
  const make = (id: number, side: number) => makeActor({ living_id:id,temp_id:side===1?3:1011,side,pos:side===1?6:2,hp:10000,init_hp:10000,sp:100,grade:50,skillId:[20611,20621,20631,30611,30621,30631] }, {attack:1000,magicAttack:1000,defence:1000,magicDefence:1000},30000);
  const a=make(1,1),b=make(2,2),e=createEngine([a,b],1,0x12345678);
  const cast=(skill=20611,target=2,now=0)=>execute(e,{actor:1,skill,targets:[target],sequence:++e.sequence,automatic:false},now);
  return {a,b,e,cast};
}
test("remoção: política usa flag original, descrição protegida e permanência",()=>{
  assert.equal(effectCanBeRemoved(buffers.get(11311)!,"shield",3),true);
  assert.equal(effectCanBeRemoved(buffers.get(201)!,"incoming",1000),false);
  assert.equal(effectCanBeRemoved(buffers.get(9201)!,"outgoing",2),false);
  assert.equal(effectCanBeRemoved(buffers.get(11511)!,"incoming",-1),false);
  assert.equal(effectCanBeRemoved({...buffers.get(20511)!,Dispel:"0"},"limit",3),false);
  assert.equal(effectCanBeRemoved({...buffers.get(20511)!,BufferName:"Não pode ser removido"},"outgoing",3),false);
});
test("dispersão ignora protegidos, permanentes e malignos sem consumir a remoção",()=>{
  const {a,b,e,cast}=setup();
  const protectedBuff=applyEffect(e,b,b,{...buffers.get(20511)!,Id:"900001",Dispel:"1"},[],"outgoing");
  const permanent=applyEffect(e,b,b,{...buffers.get(20511)!,Id:"900101",ValidCount:"-1"},[],"outgoing");
  const harmful=applyEffect(e,a,b,buffers.get(11211)!,[],"dot",10);
  const shield=applyEffect(e,b,b,buffers.get(11311)!,[],"shield");
  assert.equal(protectedBuff.removable,false);assert.equal(permanent.removable,false);assert.equal(shield.removable,true);
  const result=cast();
  assert.deepEqual(result.buffers.filter(b=>b.see_type===2).map(b=>b.buffer_id),[shield.id]);
  assert.deepEqual(e.effects.map(b=>b.id).sort(),[protectedBuff.id,permanent.id,harmful.id].sort());
  const wire=decodeMessage(typeName("battle.AttackOrderMsg"),encodeMessage(typeName("battle.AttackOrderMsg"),{order_id:20611,living_id:1,buffers:result.buffers}));
  assert.ok(wire.buffers.some((b:any)=>b.buffer_id===shield.id&&b.see_type===2&&b.cur_turn===0));
});
test("purificação remove apenas malignos elegíveis, até a quantidade disponível",()=>{
  const {a,b,e,cast}=setup();
  const good=applyEffect(e,a,a,buffers.get(11311)!,[],"shield");
  const bad1=applyEffect(e,b,a,buffers.get(11211)!,[],"dot",0);
  const bad2=applyEffect(e,b,a,buffers.get(21311)!,[],"dot",0);
  const protectedBad=applyEffect(e,b,a,{...buffers.get(21311)!,Id:"900201",Dispel:"1"},[],"dot",0);
  const result=cast(30631,1);
  assert.deepEqual(new Set(result.buffers.filter(b=>b.see_type===2).map(b=>b.buffer_id)),new Set([bad1.id,bad2.id]));
  assert.ok(e.effects.includes(good));assert.ok(e.effects.includes(protectedBad));
});
test("sorteio parcial não repete efeitos e mantém pesos iguais inclusive em efeitos acumulados",()=>{
  const {a,b,e,cast}=setup(),counts=[0,0,0];
  for(let iteration=0;iteration<6000;iteration++){
    e.effects=[];a.fury=100;
    const effects=counts.map((_,i)=>applyEffect(e,b,b,{...buffers.get(20511)!,Id:String(900001+i*100)},[],"outgoing"));
    effects[0]!.stacks=5;
    const result=cast(20611,2,iteration*100000);
    const removed=result.buffers.filter(b=>b.see_type===2);
    assert.equal(removed.length,1);counts[effects.findIndex(b=>b.id===removed[0]!.buffer_id)]!++;
  }
  assert.ok(counts.every(n=>n>1800&&n<2200),counts.join(","));
  e.effects=[];a.fury=100;
  for(let i=0;i<5;i++)applyEffect(e,b,b,{...buffers.get(20511)!,Id:String(900001+i*100)},[],"outgoing");
  const result=cast(20621,2,700000000),removed=result.buffers.filter(b=>b.see_type===2);
  assert.equal(removed.length,2);assert.equal(new Set(removed.map(b=>b.buffer_id)).size,2);assert.equal(e.effects.length,3);
});
test("flag persiste, migra saves antigos e pode ser ajustada explicitamente",()=>{
  const {a,b,e,cast}=setup();
  const eligible=applyEffect(e,b,b,buffers.get(11311)!,[],"shield");
  const protectedBuff=applyEffect(e,b,b,{...buffers.get(20511)!,Id:"900001",Dispel:"1"},[],"outgoing");
  const saved=JSON.parse(JSON.stringify(e));
  assert.equal(saved.effects[0].removable,true);assert.equal(saved.effects[1].removable,false);
  delete (eligible as Partial<Effect>).removable;delete (protectedBuff as Partial<Effect>).removable;
  actorBuffers(e,2);assert.equal(eligible.removable,true);assert.equal(protectedBuff.removable,false);
  eligible.removable=false;protectedBuff.removable=true;
  const result=cast();assert.ok(e.effects.includes(eligible));assert.ok(!e.effects.includes(protectedBuff));
  assert.deepEqual(result.buffers.filter(b=>b.see_type===2).map(b=>b.buffer_id),[protectedBuff.id]);
  assert.equal(a.permanentModifiers,undefined);
});
test("purificação sorteia entre todos os malignos; nenhum elegível não gera remoção",()=>{
  const {a,b,e,cast}=setup();
  for(let i=0;i<5;i++)applyEffect(e,b,a,{...buffers.get(11211)!,Id:String(900001+i*100)},[],"dot",0);
  const result=cast(30621,1),removed=result.buffers.filter(b=>b.see_type===2);
  assert.equal(removed.length,2);assert.equal(e.effects.length,3);
  e.effects=[];a.fury=100;
  applyEffect(e,a,a,buffers.get(11311)!,[],"shield");
  const empty=cast(30611,1,100000);assert.equal(empty.buffers.filter(b=>b.see_type===2).length,0);
});
