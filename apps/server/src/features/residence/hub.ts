import { nativePacket } from "../social/protocol.js";
import type { Store } from "../../store.js";
import type { CityPacket } from "../../city-state.js";
import type { Message } from "../../messages.js";
interface Member {uid:number;owner:number;room():Message}
export class ResidenceHub {
 readonly members=new Map<number,Member>();private pending=new Map<number,CityPacket[]>();private visuals=new Map<number,string>();
 private visual(member:Member){const {cur_pos_x,cur_pos_y,...visual}=member.room();return JSON.stringify(visual);}
 refresh(uid:number){const member=this.members.get(uid);if(member){const value=this.visual(member);if(this.visuals.get(uid)!==value){this.visuals.set(uid,value);this.broadcast(uid,{opcode:21,message:{result:1,player:[member.room()]}});}}}
 join(member:Member){const previous=this.members.get(member.uid);if(previous&&previous.owner!==member.owner)this.leave(member.uid);this.members.set(member.uid,member);this.visuals.set(member.uid,this.visual(member));if(!previous||previous.owner!==member.owner)this.broadcast(member.uid,{opcode:21,message:{result:1,player:[member.room()]}});}
 leave(uid:number){const member=this.members.get(uid);if(member){this.broadcast(uid,{opcode:22,message:{result:1,player_id:uid,army_id:uid}});this.members.delete(uid);}this.pending.delete(uid);this.visuals.delete(uid);}
 peers(uid:number,owner:number){return [...this.members.values()].filter(m=>m.uid!==uid&&m.owner===owner).map(m=>m.room());}
 broadcast(uid:number,packet:CityPacket){const owner=this.members.get(uid)?.owner;for(const member of this.members.values())if(member.uid!==uid&&member.owner===owner){const q=this.pending.get(member.uid)??[];if(packet.opcode===4185){const index=q.findIndex(p=>p.opcode===4185&&p.message?.army_id===uid);if(index>=0)q.splice(index,1);}const schema=({21:"room.RoomEnterMsg",22:"campaign.CampaignExitMsg",4185:"worldmap.PosMoveMsg",4753:"children.HomeMsg"} as Record<number,string>)[packet.opcode];q.push(schema&&packet.message?nativePacket(packet.opcode,schema,packet.message):structuredClone(packet));this.pending.set(member.uid,q);}}
 drain(uid:number){const packets=this.pending.get(uid)??[];this.pending.delete(uid);return packets;}
}
const hubs=new WeakMap<Store,ResidenceHub>();
export function residenceHub(store:Store){let hub=hubs.get(store);if(!hub){hub=new ResidenceHub();hubs.set(store,hub);}return hub;}
