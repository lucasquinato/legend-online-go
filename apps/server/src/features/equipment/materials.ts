import {readFileSync} from "node:fs";import {join} from "node:path";
import {projectRoot} from "../../config.js";import type {Message} from "../../messages.js";
export const forgeContent:{transforms:Message[];shops:Message[];configs:Message[]}=JSON.parse(readFileSync(join(projectRoot,"reference/equipment/forge.json"),"utf8"));
const model=forgeContent.shops.find(r=>Number(r.Id)===8504)!;
const lockPrice=Number(forgeContent.configs.find(r=>r.ConfigName==="Lock_Point")!.ConfigValue);
export const mouldPrices=String(forgeContent.configs.find(r=>r.ConfigName==="EquipAdv_Points")!.ConfigValue).split(",").map(Number);
// Original tables have no diamond offer for stones 1/2/7. Explicit local offers use
// 2 diamonds for the early stone and 10 for the final stone, without changing source evidence.
const localPrices:Record<number,number>={208027:lockPrice,2127001:2,2127002:2,2127007:10,2120100:mouldPrices[0]!,2120101:mouldPrices[1]!,2120102:mouldPrices[2]!,2120103:mouldPrices[3]!};
export const localForgeOffers:Message[]=Object.entries(localPrices).map(([id,price],n)=>({...model,Id:String(990100+n),ItemId:id,GiftToken:String(price),Sort:String(10+n)}));
export const forgeOffers=[...forgeContent.shops.filter(r=>Number(r.ShopType)===1&&Number(r.GiftToken)>0),...localForgeOffers];
export function forgeMaterialPrice(id:number):number|undefined{return Number(forgeOffers.find(r=>Number(r.ItemId)===id)?.GiftToken)||undefined;}
