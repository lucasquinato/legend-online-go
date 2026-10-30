import { readFileSync, writeFileSync } from 'node:fs';
const parse=name=>[...readFileSync('reference/quests/'+name+'.xml','utf8').matchAll(/<\w+\s+([^>]*?)\/>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
const conditions=parse('QuestCondictionInfos'),templates=parse('QuestTemps'),items=parse('QuestGoods');
const ids=[3,622,623,1802];
const quests=templates.filter(row=>ids.includes(Number(row.TemplateId))).map(template=>({template,conditions:conditions.filter(row=>row.TemplateId===template.TemplateId),items:items.filter(row=>row.TemplateId===template.TemplateId)}));
writeFileSync('reference/cosmos/quests.json',JSON.stringify({source:'reference/quests/QuestTemps.xml + QuestCondictionInfos.xml + QuestGoods.xml',quests},null,2));
console.log(quests.map(q=>({id:q.template.TemplateId,title:q.template.Title,conditions:q.conditions.length,items:q.items.length})));
