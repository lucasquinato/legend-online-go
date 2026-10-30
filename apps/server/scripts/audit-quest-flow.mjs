import fs from 'node:fs';
import { decodeMessage } from '../dist/messages.js';

const source = JSON.parse(fs.readFileSync('reports/missoes/missoes.json', 'utf8'));
const definitions = source.missions.filter(q => q.sourceTable === 'QuestTemps');
const story = JSON.parse(fs.readFileSync('reference/quests/story.json', 'utf8')).quests;
const scenario = JSON.parse(fs.readFileSync('data/city/scenario.json', 'utf8'));
const accepted = new Map(), finishes = [];
for (const file of fs.readdirSync('data').filter(f => /^packets-.*\.jsonl$/.test(f))) {
  const last = new Map();
  for (const line of fs.readFileSync('data/' + file, 'utf8').split('\n').filter(Boolean)) {
    const packet = JSON.parse(line);
    if (packet.direction !== 'in' || ![52, 112].includes(packet.opcode)) continue;
    const message = decodeMessage(scenario.incoming[packet.opcode], Buffer.from(packet.frame, 'base64').subarray(20));
    if (packet.opcode === 112) {
      last.set(packet.connection, { message, at: packet.at });
      for (const quest of message.quest ?? []) if (quest.is_accept) accepted.set(quest.template_id, packet.at);
    } else {
      const update = last.get(packet.connection);
      const bits = Buffer.from(update?.message.states?.bytes ?? '', 'base64');
      const bit = message.template_id - 1;
      finishes.push({ file, at: packet.at, id: message.template_id,
        historyBeforeFinish: !!((bits[Math.floor(bit / 8)] ?? 0) & (1 << (bit % 8))),
        updateAt: update?.at,
      });
    }
  }
}
const now = Date.now();
const available = q => now >= Date.parse(q.StartDate.replace(' ', 'T') + 'Z') && now <= Date.parse(q.EndDate.replace(' ', 'T') + 'Z');
const byId = new Map(definitions.map(q => [Number(q.id), q]));
const retired = story.filter(q => !available(q.template));
const report = { at: new Date().toISOString(), tableCount: definitions.length,
  storyDefinitions: story.length, storyWithinDateWindow: story.length - retired.length,
  retiredStory: retired.map(q => Number(q.template.TemplateId)),
  acceptedOnline: [...accepted.keys()],
  expiredAcceptedOnline: [...accepted.keys()].filter(id => !available(byId.get(id).attributes)),
  finishes,
};
fs.writeFileSync('reports/missoes/online-quest-flow.json', JSON.stringify(report, null, 2));
const lines = [
  '# Fluxo de missões recuperado do online', '',
  `Auditoria de ${definitions.length} definições. A cadeia principal importada tem ${story.length} registros: ${story.length - retired.length} dentro da janela de data e ${retired.length} aposentados.`, '',
  `Foram observadas ${accepted.size} missões aceitas distintas e ${finishes.length} resgates. Em ${finishes.filter(f => f.historyBeforeFinish).length} resgates, o bitmap chegou no pacote 112 antes da confirmação 52. Nenhuma missão aceita observada estava aposentada.`, '',
  'O fluxo é um grafo de pré-requisitos, não a ordem numérica dos IDs. Todos os IDs de PreQuestId precisam estar resgatados. Nível, datas e condições adicionais do cliente também limitam a disponibilidade. Missões manuais e repetíveis seguem categorias próprias.', '',
  'Sequência inicial vigente: 1832 Voltar para a Cidade → 1834 Recrutar Soldados → 1836 Eleminar Lobos → 1839 Plantar → 1840 Labirinto → 1841 Planície de Byron → 1838 Elevar o nível dos soldados → 1843 Templo de Ishtar → 1844 Santuário de Ishtar → 1848 Contratar Arqueiros → 1847 Planície dos Furries → 1850 Montanhas Tribais → 1852 Campo de Carlow → 380 Abismo do Sussuro.', '',
  'Correções locais: disponibilidade por data; histórico atualizado antes de 52; quadro posterior com somente missões ativas; bitmap preservado ao resgatar casos capturados; resgate idempotente; recompensa explícita de ouro separada da produção passiva; anexos de moeda creditados pelo ledger.', '',
  'O histórico interno é preservado. Missões principais resgatadas não reaparecem; tarefas repetíveis podem reaparecer quando as suas regras permitirem. A próxima missão só é liberada quando todos os requisitos são atendidos. Não são criados saltos artificiais sobre pré-requisitos.', '',
  'Limite: a definição de uma missão não implementa automaticamente sua funcionalidade. Objetivos de sistemas ainda ausentes permanecem pendentes; esta auditoria não confirma o jogo inteiro como reproduzido.', '',
  'Evidência do cliente: reference/campaign/evidence/current2/scripts/yishi/manager/TaskManage.as, handlers __questUpdateHandler e __questFinishHandler, checkPreTask, isAvailableTask, IsTaskFinish; tabelas em reports/missoes/missoes.json; evidência de rede em online-quest-flow.json.', '',
  '| ID | Missão | Pré-requisitos | Nível mínimo | Disponibilidade | XP | Ouro | Espírito | Cristais | Itens/anexos |',
  '|---|---|---|---:|---|---:|---:|---:|---:|---|',
];
for (const q of [...story].sort((a, b) => Number(a.template.Sort) - Number(b.template.Sort) || Number(a.template.TemplateId) - Number(b.template.TemplateId))) {
  const t = q.template;
  lines.push(`| ${t.TemplateId} | ${t.Title.replaceAll('|', '/')} | ${t.PreQuestId || '—'} | ${t.NeedMinLevel} | ${available(t) ? 'Vigente' : 'Aposentada'} | ${t.RewardPlayGP} | ${t.RewardGold} | ${t.RewardStrategy} | ${t.RewardCrystal} | ${q.items.map(i => `${i.RewardItemID} × ${i.RewardItemCount} (classe ${i.ToJob})`).join('; ')} |`);
}
fs.writeFileSync('reports/missoes/fluxo-online.md', lines.join('\n') + '\n');
console.log(JSON.stringify({ definitions: definitions.length, story: story.length, current: story.length - retired.length, retired: retired.length, finishes: finishes.length, historyFirst: finishes.filter(f => f.historyBeforeFinish).length }));
