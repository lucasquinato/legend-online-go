import {encodeMessage,projectMessage,typeName,type Message} from '../../messages.js';
import type {CityPacket} from '../../city-state.js';
export function nativePacket(opcode:number,schema:string,message:Message,delayMs=0):CityPacket {const name=typeName(schema);return {opcode,authoritative:true,body:encodeMessage(name,projectMessage(name,message)).toString('base64'),delayMs};}
