import { furnitureFields } from "../residence/policy.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";
const data = JSON.parse(readFileSync(join(projectRoot,"reference/navigation-tables.json"),"utf8"));
export const tasks: Message[] = data.tables.NavigationTaskTempInfos;
export const offers: Message[] = data.tables.NavigationShopTempInfos;
export const furniture: Message[] = data.tables.FurnitureTempInfos.map((row:Message)=>({...row,...furnitureFields(row)}));
export const navigationUpgrade = (type:number,level:number):Message|undefined => data.upgrades.find((r:Message)=>Number(r.Types)===type&&Number(r.Grades)===level);
export const navigationConfig = (name:string):number => {
 const row=data.configs.find((r:Message)=>r.ConfigName===`navigation_${name}`);
 if(!row || !Number.isFinite(Number(row.ConfigValue))) throw new Error(`Configuração original ausente: navigation_${name}`);
 return Number(row.ConfigValue);
};

export const furnitureOffers:Message[]=data.tables.FurnitureShopTempInfos.map((r:Message)=>({...r,CostItemId:-400,CostItemCount:100}));
