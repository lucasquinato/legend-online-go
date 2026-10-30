import {createHash,createPublicKey,sign,verify} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function safePath(value){return typeof value==='string'&&value.length<240&&/^[A-Za-z0-9_./ -]+$/.test(value)&&!value.startsWith('/')&&!value.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith('.')||p.endsWith(' '))&&!value.split('/').some(p=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));}
export function validateRelease(data){
 if(data.schema!==1||!['launcher','client'].includes(data.kind)||!/^\d+\.\d+\.\d+$/.test(data.version)||!Array.isArray(data.files)||!data.files.length||data.files.length>20000)throw Error('Release inválida.');
 const seen=new Set();for(const f of data.files){if(!safePath(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>256*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256)||seen.has(f.path.toLowerCase()))throw Error('Arquivo inválido na release.');seen.add(f.path.toLowerCase());}
 return data;
}
export function seal(data,key){validateRelease(data);const payload=Buffer.from(JSON.stringify(data));return{payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,key).toString('base64')};}
export function unseal(envelope,key){const bytes=Buffer.from(envelope.payload,'base64');if(!verify('RSA-SHA256',bytes,createPublicKey(key),Buffer.from(envelope.signature,'base64')))throw Error('Assinatura inválida.');return validateRelease(JSON.parse(bytes));}
