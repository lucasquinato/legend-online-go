import type {Store} from '../../store.js';
import type {CitySave} from '../../city-world.js';
import type {Message} from '../../messages.js';
import {decodeMessage,typeName} from '../../messages.js';
import type {CityPacket} from '../../city-state.js';
import {weddingProps} from './wedding-props.js';
import {ResidenceHub} from '../residence/hub.js';
import {nativePacket} from './protocol.js';
import {SocialError,queueLocalEvent} from './index.js';
const hubs=new WeakMap<Store,ResidenceHub>();
export function weddingHub(store:Store){let hub=hubs.get(store);if(!hub){hub=new ResidenceHub();hubs.set(store,hub);}return hub;}
interface Context{store:Store;uid:number;readonly saved:CitySave;persist():void;now?():number;atomic<T>(fn:()=>T):T}
export class WeddingFeature{
 constructor(private c:Context){}
 get active(){return [4301,4302,4303].includes(this.c.saved.map)&&!!this.c.saved.wedding;}
 private get hub(){return weddingHub(this.c.store);}
 private room():Message{const {army,hero,player}=this.c.saved.state,p=this.c.store.tutorialProfile(this.c.uid)!;return {...army,player_id:this.c.uid,army_id:this.c.uid,hero_id:this.c.uid,nick_name:p.nickname,template_id:p.icon,head_id:p.icon,sex:p.sex,grades:player.grades,fighting_capacity:hero.fighting_capacity,campaign_id:this.c.saved.map,online_state:1,army_state:0};}
 private join(){this.hub.join({uid:this.c.uid,owner:this.c.saved.wedding!.id,room:()=>this.room()});}
 private scene():CityPacket[]{const row=this.c.store.db.prepare('SELECT data FROM social_marriages WHERE id=?').get(this.c.saved.wedding!.id),data=row?JSON.parse(String(row.data)):{};const own=this.room(),players=[own,...this.hub.peers(this.c.uid,this.c.saved.wedding!.id)];return [{opcode:4165,message:{army_id:this.c.uid}},{opcode:125,message:{created_type:1,room:{room_id:this.c.saved.wedding!.id,campaignId:this.c.saved.map,master_id:0,name:'Salão de Casamento',count:players.length,capacity:100}}},nativePacket(127,'campaign.CampaignNodeListMsg',{node:[...weddingProps(this.c.saved.map,data),{node_id:3,camp_data_id:3,node_name:'Andrew',master_type:61,son_type:3019,state:1,pos_x:50,pos_y:43,cur_x:50,cur_y:43,resource:1,handler_range:6,name_color:4,param1:3},{node_id:8,camp_data_id:8,node_name:'Recepção',master_type:61,son_type:3018,state:1,pos_x:50,pos_y:65,cur_x:50,cur_y:65,resource:1,handler_range:6,name_color:4,param1:8}]}),nativePacket(21,'room.RoomEnterMsg',{result:1,player:players}),{opcode:131,message:{army_id:this.c.uid,player_id:this.c.uid,cur_pos_x:own.cur_pos_x,cur_pos_y:own.cur_pos_y,state:0}}];}
 enter(id:number,map:number):CityPacket[]{if(this.c.saved.battle&&!this.c.saved.battle.finished)throw new SocialError('Conclua a batalha antes de entrar na cerimônia.');this.disconnect();this.c.saved.wedding={id};this.c.saved.map=map;delete this.c.saved.instanceFury;Object.assign(this.c.saved.state.army,{map_id:map,cur_pos_x:45,cur_pos_y:62,state:0});const result=this.scene();this.join();this.c.saved.location=result;this.c.persist();return result;}
 reconnect(){const result=this.scene();this.join();return result;}
 disconnect(){this.hub.leave(this.c.uid);}
 leave(){this.disconnect();delete this.c.saved.wedding;this.c.saved.map=1;Object.assign(this.c.saved.state.army,{map_id:1,state:0});delete this.c.saved.location;this.c.persist();}
 tick(){if(!this.active){this.disconnect();return [];}const row=this.c.store.db.prepare('SELECT data FROM social_marriages WHERE id=?').get(this.c.saved.wedding!.id),d=row?JSON.parse(String(row.data)):{};if(!d.phase||(this.c.now?.()??Date.now())>=Number(d.createdAt??d.engagedAt)+120*60000){queueLocalEvent(this.c.store,this.c.uid,{opcode:0,message:{weddingExit:this.c.saved.wedding!.id}});return[];}this.hub.refresh(this.c.uid);return this.hub.drain(this.c.uid);}
 handle(op:number,body:Buffer):CityPacket[]|undefined{if(!this.active)return;if([5038,5035,5004,5033].includes(op))return [];
 if(op===5125){const r=decodeMessage(typeName('campaign.CampaignReqMsg'),body),id=Number(r.para_int1),node=id===3?{x:50,y:43,type:11,name:'Andrew'}:id===8?{x:50,y:65,type:12,name:'Recepção'}:undefined;if(!node)throw new SocialError('NPC inexistente neste salão.');const army=this.c.saved.state.army;if(Math.hypot(Number(army.cur_pos_x)-node.x,Number(army.cur_pos_y)-node.y)>6)throw new SocialError('Aproxime-se do NPC para conversar.');return [nativePacket(29,'campaign.CampaignConfirmMsg',{title:node.name,body:'',map_id:this.c.saved.map,node_id:id,type:node.type})];}
 if(op!==5124)return;const r=decodeMessage(typeName('worldmap.PosMoveMsg'),body),routes=r.routes??[];if(Number(r.army_id)!==this.c.uid||Number(r.map_id)!==this.c.saved.map||!routes.length||routes.length>2048||routes.some((p:Message)=>![p.x,p.y].every(n=>Number.isInteger(n)&&n>=0&&n<2000)))throw new SocialError('Trajeto inválido.');this.c.atomic(()=>{const last=routes.at(-1);Object.assign(this.c.saved.state.army,{cur_pos_x:Math.floor(last.x/20),cur_pos_y:Math.floor(last.y/20)});this.c.persist();});this.hub.broadcast(this.c.uid,{opcode:4185,message:{map_id:this.c.saved.map,army_id:this.c.uid,userId:[this.c.uid],routes,army_state:0}});return [];}
}
