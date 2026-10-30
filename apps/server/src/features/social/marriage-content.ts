import{readFileSync}from'node:fs';import{join}from'node:path';import{projectRoot}from'../../config.js';import type{Message}from'../../messages.js';
export const marriageContent: {qualities:Message[];upgrades:Message[];configs:Message[];skills:Message[];properties:Message[]} =JSON.parse(readFileSync(join(projectRoot,'reference/social/content.json'),'utf8'));
export const marriageConfig=(name:string,fallback=0)=>Number(marriageContent.configs.find(r=>r.ConfigName===name)?.ConfigValue??fallback);
export const marriageUpgrade=(type:number,level:number,template=0)=>marriageContent.upgrades.find(r=>Number(r.Types)===type&&Number(r.Grades)===level&&Number(r.TemplateId)===template);
