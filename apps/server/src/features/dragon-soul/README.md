# Alma do Dragão

`index.ts` contém progressão, consumo, protocolo e fonte de atributos. As tabelas
originais ficam em `reference/dragon-soul/content.json`; o esquema adicional de
CommonMsg foi extraído do cliente e carregado em `src/messages.ts`.

O estado por conta é `CitySave.dragonSoul`. `synchronize` substitui a fonte central
sem acumular bônus. `packets` fornece o modelo nativo 4555; `CityWorld.packet`
impede respostas históricas de substituírem esse estado.

Um material fornece um ponto da necessidade da tabela. No Sagrado, o botão
nativo compra um passo inteiro pelo custo Data. Alimentação rápida comum
preenche somente a próxima etapa. Transição ao Coração e despertar gratuitos
são políticas locais provisórias, explícitas em `dragonPolicy`, sem alteração
de profissão ou classe. Percentuais usam a camada central do personagem.

Reduções elementais são metadados separados em `AttributeSource.elementalReductions`.
`AttributeCalculator.snapshot` os disponibiliza no modelo do personagem; não
são resistência bruta e não ativam efeitos de batalha.

Validação: `npx tsx --test test/dragon-soul.test.ts`. Evidências, decisões e
entrega dos materiais ficam em `reports/alma-do-dragao/implementation/`.
