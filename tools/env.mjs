import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {createPublicKey} from 'node:crypto';
export const root=fileURLToPath(new URL('../',import.meta.url));
export function loadProjectEnv(){
 const selected=new URL(existsSync(new URL('../.env',import.meta.url))?'../.env':'../.env.example',import.meta.url);
 if(process.env.LEGEND_SKIP_ENV_FILE!=='true'&&existsSync(selected))loadEnvFile(fileURLToPath(selected));
 return selected;
}
export function releasePrivateKey(){
 loadProjectEnv();
 const value=process.env.RELEASE_SIGNING_PRIVATE_KEY_BASE64;
 if(!value)throw Error('Defina RELEASE_SIGNING_PRIVATE_KEY_BASE64 no .env ou .env.example da raiz.');
 const key=Buffer.from(value,'base64');
 const jwk=createPublicKey(key).export({format:'jwk'});
 const xml=`<RSAKeyValue><Modulus>${Buffer.from(jwk.n,'base64url').toString('base64')}</Modulus><Exponent>${Buffer.from(jwk.e,'base64url').toString('base64')}</Exponent></RSAKeyValue>`;
 if(readFileSync(new URL('../client/manifests/update-public.xml',import.meta.url),'utf8').trim()!==xml)throw Error('Chave de assinatura não corresponde à identidade pública do launcher.');
 return key;
}
