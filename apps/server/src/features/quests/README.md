Missões da cadeia principal

`reference/quests/story.json` contém 146 definições permanentes recuperadas de
`reports/missoes/missoes.json`, descendentes da missão 1832. O importador
`scripts/import-story-quests.mjs` preserva títulos, pré-requisitos, condições e
recompensas da tabela original. Não importa eventos, tarefas diárias ou outros
grupos de missões sem relação com essa cadeia.

A auditoria `scripts/audit-quest-flow.mjs` encontrou 91 definições vigentes e
55 aposentadas por data nessa cadeia. Datas em 2000 não são sentinelas neutras:
TaskManage impede sua aceitação. As capturas não contêm nenhuma delas aceita.
Pré-requisitos de missões aposentadas continuam válidos para contas com
histórico antigo; não são removidos nem premiados artificialmente.

`index.ts` reconhece o histórico tanto pelas missões resgatadas quanto pelo
bitmap `quest_site`. CityWorld aceita as sucessoras quando todos os requisitos
e o nível permitem, inclusive ao reconectar uma conta cujo quadro ficou vazio.
Aceitar não entrega recompensa; o resgate continua atômico e único, usando os
ledgers e o inventário existentes.

O resgate envia 112 com o histórico atualizado, 52 para retirar a missão e 112
com o quadro ativo. Essa ordem foi confirmada em 85 resgates online. Atualizações
e login não reenviam missões entregues. O bitmap é mesclado, inclusive nos
casos capturados, e mantém o byte final ignorado pelo leitor do cliente.

Recompensas de ouro usam o valor da tabela e os anexos de moeda, sem incluir
renda passiva misturada na captura. Recursos em anexos negativos também
passam pelo ledger. A conclusão não é suficiente para aceitar a próxima
missão: são necessários resgate, datas, nível e todas as predecessoras.

Os objetivos conhecidos consultam nível, construções, recrutamento, evolução
dos soldados, campanhas concluídas, chefes vencidos e ações de formação. Os
objetivos de fazenda, amizade e labirinto mantêm suas integrações em CityWorld.
Tipos ainda sem integração permanecem pendentes; carregar sua definição não
equivale a implementar automaticamente a funcionalidade correspondente.

Os testes em `test/campaign-rules.test.ts` cobrem a entrega de Byron, sucessoras,
upgrade de soldados, formação, requisitos de nível, vitórias anteriores,
reconexão, histórico binário, recompensa única e rollback do resgate.
