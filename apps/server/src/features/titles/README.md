# Títulos — núcleo concluído, etapas 1 a 7

A etapa 1 entrega o catálogo; a etapa 2 acrescenta o estado persistente por conta.
CityWorld inicializa e valida `saved.titles` no ciclo normal de carga/salvamento.
Os avaliadores da etapa 3 são puros. A etapa 4 os conecta ao salvamento das
alterações de gameplay e ao reconhecimento retroativo no login. A etapa 5 fornece
os bônus brutos à central de atributos. A etapa 6 conecta consulta, seleção visual,
identidade e notificações ao protocolo original.
O ciclo da etapa 7 expira posses e recebe decisões de manutenção/renovação dos
sistemas responsáveis. Isso conclui o núcleo genérico; sistemas de gameplay ainda
ausentes continuam com suas condições pendentes, sem conceder títulos por estimativa.
Modas, montarias e demais sistemas existentes
mantêm o comportamento atual.

## Origem e reprodução

`reference/titles/content.json` contém as 951 definições de AppellInfos, as 176
propriedades referenciadas e suas habilidades. Os dados vêm exclusivamente de
`reference/quests/tempinfos.original.bin`, já preservado no backend. O artefato
registra SHA-256 do arquivo e das cinco tabelas consultadas. Não usa o cliente,
o servidor online ou o banco de contas.

Reproduzir: `node --import tsx scripts/import-title-content.ts`.
O importador valida o catálogo completo antes de substituir o JSON. Não usa
formatter. Entidades XML são decodificadas uma vez; os campos originais de cada
registro continuam em `raw` e as referências de efeitos preservam seus registros.

## Contrato de consulta

`titleCatalog.get(id)` obtém uma definição; `list` filtra por categoria, classe,
tipo de condição, domínio ou chave de requisito. Títulos universais são incluídos
no filtro de uma classe. O catálogo não filtra títulos ocultos por posse: isso
pertence à futura apresentação do estado do jogador. Os objetos retornados são
imutáveis. A ordenação do catálogo usa Sort decrescente e ID para desempate; a
prioridade de títulos obtidos é responsabilidade da futura lista do personagem.

Categorias: 1 pessoal, 2 PvP, 3 PvE, 4 outros. A aba de obtidos não é uma categoria
do catálogo. Aparência inclui imagem, dimensões, texto, cor, prefixo e flags de
ocultação. O ShowParam original é preservado e interpretado conforme o módulo
mais recente recuperado, em reference/campaign/evidence/version2/scripts.

## Requisitos para sistemas futuros

`requirements.ts` descreve as 52 condições encontradas, com chave estável e
domínio. Exemplos: `mounts.ownership`, `fashion.collection`, `fashion.level`,
`labyrinth.floor`, `abyss.floor`, `farm.maintenance`.

Cada requisito preserva CondtionType, Para e grupos separados por `|` e `,`.
Os grupos permanecem strings: não se transforma automaticamente o último número
em meta ou contador. Somente formatos verificados têm validação específica:
ID de montaria, lista de peças e alvos de nível/piso. As demais condições mantêm
parâmetros opacos até a integração correspondente. Nem todo texto descritivo
comprova se a condição é posse, consumo, conclusão histórica ou manutenção atual.

Todas as condições têm `evaluation: pending-integration`, inclusive aquelas com
semântica descrita. `definitionStatus: documented` significa descrição da família,
não implementação nem comprovação de obtenção. Tipos desconhecidos tornam-se
`unmapped:<tipo>` e continuam no catálogo, sem serem aceitos ou descartados.

Um futuro sistema pode fornecer outro registro de TitleConditionDefinition ao
construtor, sem modificar as 951 definições. A etapa 3 fornece avaliadores
por chave/tipo; a etapa 4 os conecta às mudanças de estado e à reconciliação no login. O
catálogo não recebe cópias de saves de cada sistema nem conhece CityWorld.

## Efeitos e validade

`effects` fornece referências de propriedades brutas com modo flat/percentage e
nomes canônicos total_*. Não soma, converte primários ou aplica percentuais.
Todas as 176 propriedades atualmente usadas são fixas; 950 títulos têm efeitos.
O título VIP 431 não tem bônus. Não há Buffs usados nesta tabela, mas referências
futuras são preservadas e validadas. Campos numéricos desconhecidos não nulos,
negativos e referências ausentes são recusados, evitando bônus ignorados.

Títulos diferentes podem apontar para a mesma propriedade. A posse e a fonte
são únicas por ID de título; não deduplicar os efeitos por ID de habilidade.
O cálculo de todos os títulos válidos é responsabilidade da central na etapa 5.

Time e IsLong são preservados sem supor unidades ou permanência. A validade final
pertence ao servidor; Time=0 não prova que um título de ranking nunca será
revogado. O contrato recuperado de desbloqueio é nível mínimo 45, missão 936 e
flag applle_property_Open. O importador confere a missão no acervo; esta etapa
não libera a flag de nenhuma conta.

## Etapas implementadas

1. Catálogo: concluído.
2. Estado persistente: concluído; contrato abaixo.
3. Avaliadores por família: concluído; contrato abaixo.
4. Concessão por mudanças de gameplay e reconhecimento retroativo no login: concluído para as famílias verificadas abaixo.
5. Contribuição bruta dos títulos válidos na central de atributos: concluído.
6. Consulta, equipamento, notificações e identidade visual pelo protocolo: concluído.
7. Expiração automática e contrato de manutenção/renovação para condições variáveis/rankings: concluído. A apuração dos rankings depende dos respectivos sistemas.

Validação: `node --import tsx --test test/titles-catalog.test.ts test/titles-state.test.ts test/titles-evaluation.test.ts test/titles-reconciliation.test.ts test/titles-attributes.test.ts test/titles-protocol.test.ts test/titles-lifecycle.test.ts`,
`npm run check` e `npm run build`.

## Estado persistente — etapa 2

`state.ts` define TitleSave versão 1. O estado fica dentro de `city_worlds.state`,
como os demais sistemas do personagem. A coleção é esparsa: só há registro quando
existe progresso ou posse; não se criam 951 linhas vazias em cada conta.

- `entries[id].progress`: chave/tipo da condição, estado da avaliação, métricas
  JSON genéricas, representação de progresso do cliente, data e origem. Não
  interpretar uma métrica como meta ou conceder posse porque o status é completed.
- `entries[id].ownership`: primeira e última obtenção, origem, validade absoluta
  em milissegundos ou null e eventual revogação com data/origem.
- `entries[id].acquisitionKeys`: recibos persistentes de origem/referência, por
  título. Repetir uma obtenção não renova validade, não duplica bônus e não
  ressuscita um título revogado. Uma readquisição usa outra referência e conserva
  a primeira data de obtenção. O chamador futuro deve usar referências estáveis
  de eventos, não gerar uma nova referência a cada reconciliação.
- `selectedId`: uma escolha visual, independente dos demais títulos possuídos.
- `attributeAccess`: liberação dos atributos com data/origem próprias. Esta etapa
  não conclui a missão 936 nem projeta a liberação no PlayerMsg.
- `pendingAcquisitions`: fila persistente de obtenções para as notificações da
  etapa 6, separando reconhecimento retroativo de novas conquistas durante o jogo.

Funções de armazenamento para as próximas etapas: recordTitleProgress,
recordTitleAcquisition, revokeTitle, selectTitle e recordTitleAttributeUnlock.
São operações internas em memória, sem persistência autônoma: o chamador deve
executá-las dentro da transação da cidade e chamar persist. Não são endpoints ou
provas de que um requisito foi cumprido. A verificação da condição/classe na
concessão pertence ao reconciliador; a seleção já exige posse válida e classe.
O ID 0 é aceito internamente para limpar seleção, sem inventar um botão no SWF.

titleOwned/selectedTitle consultam validade pelo relógio fornecido, mesmo após
horas offline, e não alteram o histórico. Um título expirado não é utilizável.
A limpeza ativa, notificações, retirada de fontes e manutenção de rankings
continuam na etapa 7. Não deduzir duração a partir de Time: expiresAt precisa ser
fornecido por uma regra comprovada; null não substitui uma regra desconhecida.

No carregamento de saves antigos, initializeTitleSave acrescenta uma coleção
vazia. Campos capturados appell_id e applle_property_Open não provam posse nem
liberação; valores positivos são guardados apenas em legacy com política
unverified-not-imported. O catálogo e o estado são independentes: títulos que
deixarem de existir no catálogo conservam progresso e histórico, mas não são
considerados utilizáveis pela consulta. Saves de versão desconhecida ou inválidos
são recusados sem serem sobrescritos por uma coleção vazia.

CityWorld valida o estado antes de salvar; JSON, savepoints e o rollback existente
preservam todas as suas partes em conjunto. As funções não guardam referências
ao save anterior, portanto o rollback por substituição do estado não cria uma
coleção paralela. O primeiro load/save normal persiste a migração; não foi feito
reset, concessão em massa ou alteração manual das contas locais.

## Avaliadores — etapa 3

TitleRequirementEvaluator recebe uma definição do catálogo e contexto explícito:
subjectId, classe básica, instante em milissegundos e um leitor de fatos. Não
recebe Store/CityWorld, não usa Date.now e não grava progresso, posse ou atributos.
O resultado é fulfilled, unfulfilled ou pending-integration, com motivo e, quando
há avaliação completa, um TitleProgress compatível com a etapa 2. O estado
pending-integration do catálogo é descritivo; o resultado dinâmico fica separado.

Fatos têm chave estável, sujeito, instante da observação, indicação de completude,
origem e valor JSON. Precisam pertencer à mesma conta e ao mesmo instante do lote.
Isso impede reutilizar acidentalmente um snapshot antigo de uma montaria que já
expirou. observedAt é a data de leitura/validação do snapshot; não é a data do
evento histórico contado. O provedor responde pela autoridade do dado.

Ausência não significa zero. Leitor ausente, coleção parcial, informação inválida,
condição desconhecida ou falha de provedor deixam a integração pendente. Não há
progress nesses resultados: o consumidor futuro não deve zerar o progresso salvo.
Restrição de classe retorna unfulfilled com class-restriction, sem consultar fatos
ou gerar progresso. Parâmetros não suportados também ficam pendentes.

Regras incluídas:

| Chave | Fato | Interpretação |
|---|---|---|
| mounts.ownership | mounts.activeIds | ID exato da montaria ativa |
| fashion.collection | fashion.activeIds | Todas as peças requeridas, sem contar duplicatas |
| fashion.level | fashion.level | Nível maior/igual à meta, limitado ao máximo conhecido 200 |
| labyrinth.floor | labyrinth.normal.maxClearedFloor | Maior piso comprovadamente concluído, até 100 |
| abyss.floor | labyrinth.abyss.maxClearedFloor | Histórico independente do abismo, até 30 |
| farm.maintenance | farm.lifetimeCareCounts | Cada meta de ação precisa ser satisfeita |

As primeiras cinco regras atendem 766 definições do catálogo. A sexta atende o
título de manutenção da fazenda, mas o armazenamento atual não tem os contadores
históricos necessários. Sua integração permanece pendente até existir um provedor
confiável. No fato de fazenda, as chaves 1/2 são as ações normalizadas da condição
(vermes/ervas); não são os opcodes de operação da fazenda.

localTitleFactReader copia os campos relevantes dos saves locais e expõe as cinco
primeiras famílias. Não inicializa módulos, normaliza saves ou lê o banco. Usa
montarias registradas como ativas no instante, peças com is_switch e histórico
record/cleared do labirinto. Estar no piso final, entrar no mapa ou sair da rodada
não prova vitória. Um record mantido após reset permite reconhecer a conclusão.
Não transforma contadores de plantio, flags de pragas ou logs diários em totais
históricos. Para=1 do título de cosmo não é interpretado como nível 1 ou 10.

Avaliar uma montaria atualmente expirada como unfulfilled não autoriza revogar
um título já obtido por sua ativação passada. Concessão histórica, condições de
manutenção e validade continuam responsabilidades explícitas das etapas 4 e 7.

evaluateAll permite filtrar o catálogo por família/domínio e lê cada fato uma vez
por lote. Observações e resultados não compartilham referências mutáveis com os
saves. Falhas de avaliadores e saídas inválidas nunca resultam em aprovação.

Para um sistema futuro, descreva sua condição no registro do catálogo e adicione
um TitleRule com a mesma chave e CondtionType. thresholdTitleRule,
collectionTitleRule e compoundCounterTitleRule oferecem os padrões comuns;
regras especiais podem implementar evaluate diretamente. Os decodificadores de
Para precisam ter semântica verificada antes do registro: não se escolhe uma regra
somente porque os parâmetros parecem números. O provedor pode ser composto com
localTitleFactReader sem modificar os módulos de modas/montarias.

O resultado de avaliação não define duração nem identidade do evento de concessão.
A etapa 4 usa recibos estáveis de eventos/condições, sem gerar uma nova
obtenção a cada snapshot, e só persiste progresso com fatos completos. A seleção visual e o
desbloqueio de atributos não influenciam a satisfação de um requisito.

## Concessão e reconciliação — etapa 4

TitleReconciler combina avaliadores com políticas explícitas de concessão.
CityWorld consulta os fatos locais depois de sincronizar o personagem e antes de
gravar a cidade. Assim, alterações de modas, montarias e conclusões de pisos
geram progresso/posse na mesma transação que salva o estado de origem, sem mudar
os módulos existentes. O primeiro salvamento da sessão também reconhece as
conquistas comprovadas de contas anteriores. Não reexecuta ações nem importa
títulos de personagens das capturas online.

As cinco famílias com fatos locais cobrem 766 títulos: posse da montaria exata,
coleção de peças ativadas, nível de moda e conclusão dos últimos pisos do
labirinto/abismo. O avaliador de manutenção da fazenda continua preparado, mas
sem provedor de contadores históricos: não concede por estimativa. As demais
condições aguardam integração. Ter avaliador suficiente para concluir a condição
não autoriza automaticamente a concessão: uma família nova também deve registrar
TitleGrantPolicy com duração e semântica verificadas. As políticas atuais aceitam
somente as famílias listadas e definições Time=0/IsLong=false. Não extrapolar
essa permanência para rankings ou outras famílias.

Cada conquista usa um recibo estável por condição/título. Novos logins, repetição
de pacotes e tentativas de salvar não duplicam obtenções ou notificações.
Progresso só é atualizado quando muda de fato; fatos ausentes/parciais não apagam
histórico. Perder uma montaria não revoga automaticamente uma conquista permanente.
Uma posse anteriormente revogada ou expirada também não é renovada por essa
reconciliação: políticas de manutenção/readquisição pertencem à etapa 7.

prepare trabalha por cópia e não altera o save recebido. A cidade instala o novo
estado dentro do savepoint; qualquer erro de gravação restaura o estado anterior.
accept confirma apenas o cache depois do sucesso. O cache considera fatos, classe,
sujeito, liberação e conteúdo do save; rollback por substituição invalida-o. Não
reavalia centenas de definições em salvamentos cujo estado relevante não mudou.

A liberação interna de atributos exige nível 14 e missão 936 efetivamente
resgatada. A etapa 5 usa essa liberação para calcular os bônus; a etapa 6 projeta
applle_property_Open e a seleção visual no protocolo.
A fila pendingAcquisitions conserva data e indicação retroactive para a futura
entrega no protocolo; esta etapa não emite centenas de avisos antigos no login.
Nenhuma conta real foi resetada ou alterada manualmente. A reconciliação ocorre
no próximo carregamento/salvamento usando a versão atualizada do servidor.

## Fontes de atributos — etapa 5

attributes.ts produz uma fonte `titles:<id>` para cada título possuído, válido e
compatível com a classe. Todos os títulos nessas condições contribuem, mesmo
quando outro título é exibido. Selecionar ou esconder um nome não soma nem retira
bônus. Progresso completed sem posse, título desconhecido no catálogo, aquisição
futura, expiração e revogação não fornecem fonte. O nível atual precisa ser ao
menos 14 e attributeAccess deve registrar desbloqueio já ocorrido. Uma flag
capturada no PlayerMsg nunca substitui esse registro verificado.

Cada fonte contém somente valores fixos e percentuais brutos das propriedades
recuperadas. A central AttributeCalculator converte primários, soma os fixos e
aplica os percentuais globais, junto aos demais sistemas. Não há conversão,
multiplicação percentual ou cálculo de poder dentro do módulo de títulos. O
acervo atual contém apenas efeitos fixos; o contrato e testes também cobrem
primários e percentuais para novas definições. Referências de Buffs não suportadas
falham explicitamente, em vez de entregar bônus parciais silenciosamente.

synchronizeTitleAttributes substitui apenas o namespace titles:, removendo fontes
antigas, expiradas ou revogadas sem subtrair de outras fontes. Títulos distintos
que usam a mesma propriedade contribuem separadamente. Sem efeitos, como o VIP
431, a posse continua registrada e nenhuma fonte vazia é criada.

CityWorld sincroniza as fontes ao recompor o herói, inclusive antes de iniciar
batalha. No salvamento, prepara os demais sistemas, reconcilia novas obtenções e
liberação e então calcula o painel uma única vez com os títulos atualizados.
O painel, o poder do jogador e a representação do exército usam esse resultado.
Posse, fontes e painel são gravados na mesma transação; falha restaura a projeção
em memória e o banco. Reconexão recompõe as fontes, sem somar novamente bônus
persistidos. Esta etapa não reinicia contas nem altera o comportamento de modas.

A consulta à validade já exclui o bônus expirado na recomposição. Agendamento de
expiração, avisos proativos, regras de rankings e readquisições continuam na etapa
7. Sincronização visual, consulta e notificações no protocolo são descritas abaixo.

## Protocolo e identidade — etapa 6

Contrato recuperado exclusivamente do acervo do backend, em
reference/campaign/evidence/version2/scripts e
reference/skills/formation-ui/verify-local/scripts/appell. Não foram modificados
SWFs, recursos gráficos ou módulos de modas. A validação automatizada inclui
protobuf e TCP criptografado real; não substitui um teste visual manual no AIR.

| Operação | Pacote | Conteúdo |
|---|---|---|
| Consultar | 8597 AppellExchangeMsg | appellId=0, look=true |
| Selecionar | 8597 AppellExchangeMsg | appellId do título possuído, look=false |
| Lista completa | 4484 AppellsMsg | appells com appellId/isGet/value/validDate |
| Aviso nativo | 4491 AppellExchangeMsg | appellId obtido; restrição descrita abaixo |
| Identidade própria | 3 PlayerMsg | appell_id e applle_property_Open |
| Identidade em cena | 150/131/140 ArmyMsg, 21 RoomPlayerMsg | appellid |
| Prefixo do chat | 83 ChatChannelMsg | appellid validado no servidor |

A lista inclui todas as definições da classe, incluindo condições ainda sem
integração, com isGet=false quando não há posse válida. O cliente aplica suas abas,
ordenação e ocultação IsHide; o servidor não inventa progresso para condições
pendentes. value contém o progresso salvo ou string vazia, que o parser recuperado
trata como ausência/zero. validDate é explícito: instante absoluto UTC para posse
temporária ou o sentinela original 2000-01-01 00:00:00 para permanentes/inativos.
Isso remove datas antigas dos templates mutáveis do cliente.

A seleção exige posse, classe e validade; é gravada antes da resposta e permanece
após reconectar. Selecionar não cobra recursos nem altera a contribuição dos
outros títulos. ID 0/false limpa a seleção no protocolo, sem acrescentar um botão
ao cliente. Consultar não seleciona, concede ou renova títulos. Solicitações
inválidas, campos inesperados, duplicados e IDs fora de faixa não alteram o save.

PlayerMsg, ArmyMsg e os dados próprios de RoomPlayerMsg recebem a identidade
validada, inclusive quando outro módulo prepara o pacote de cena. A lista de
capturas não é fonte de posse: 4484 é reconstruído; antigos 4484/4491 são filtrados
do bootstrap/replay de ações. O chat ignora appellid enviado pelo jogador e consulta
a seleção válida da sessão. Capturas não podem restaurar outro título ou liberar
os atributos. A flag de liberação usa a mesma condição que o cálculo da etapa 5.

Novas obtenções atualizam lista, identidade e painel. A fila persistente só é
consumida depois que o bootstrap ou uma consulta comprova que o cliente iniciou
a interface; avisos aguardam o fim da batalha. O reconhecimento retroativo é
silencioso. Notice=false também não produz aviso. Várias obtenções simultâneas
recebem um resumo, evitando uma sequência de janelas. Consultar novamente ou
relogar não reenvia avisos já consumidos. A entrega e retirada da fila estão na
transação; falha ao gravar/serializar conserva a seleção e a notificação pendente.
O protocolo não tem confirmação de recebimento do popup: uma queda de conexão
após confirmar a transação pode perder o aviso, mas não a posse/lista persistida.

Há uma limitação confirmada em AppellManager/getAppellTip e
mainBar/view/AppellGetView: o pacote 4491 contém o ID obtido, mas o texto da animação
vem do título atualmente equipado. Por isso o aviso nativo é usado apenas quando
esses IDs coincidem. Para outro título, usa-se o aviso central de aquisição com
o nome correto, preservando a escolha visual do jogador. Não se equipa um título
temporariamente nem se edita o SWF para contornar essa limitação.

Expiração proativa, políticas de renovação e o contrato de manutenção de rankings
são descritos abaixo. A consulta e a seleção também recusam posses vencidas.

## Expiração e manutenção — etapa 7

`expireTitles` trabalha por cópia e usa o expiresAt absoluto registrado na posse.
Ao vencer o prazo, registra revogação na data exata do vencimento, limpa a seleção
inválida e enfileira uma retirada. Mantém primeira obtenção, último registro de
posse e recibos de concessão. Repetir o pulso não duplica retirada. Títulos
permanentes não são revogados por simplesmente desaparecer um fato de coleção.

O ciclo de persistência executa expiração antes da reconciliação/cálculo. No login,
aplica vencimentos que ocorreram offline, sem transformar o instante da reconexão
na data do vencimento e sem mostrar avisos retroativos. Durante a sessão, o pulso
de 100 ms verifica o próximo prazo e persiste quando ele vence, mesmo sem pedidos
do jogador. Não há uma varredura completa dos títulos a cada pulso: o prazo é
recalculado ao salvar ou ao restaurar outro objeto de save após rollback.

A fonte vencida sai do cálculo, o nome deixa de aparecer no personagem e no chat
e a lista recebe isGet=false. Os avisos de retirada aguardam a interface estar
pronta e a batalha terminar; várias retiradas simultâneas viram um resumo. Um
título obtido novamente antes do aviso não gera uma falsa mensagem de perda.
O snapshot de uma batalha já iniciada permanece intacto; novas batalhas usam os
atributos atuais. Falha no SQLite conserva a posse, os bônus e a fila anteriores,
permitindo repetir a operação. O prazo em memória também se recupera de rollback.

### Contrato para rankings, VIP e condições futuras

`TitleMaintenance` recebe uma política por chave/tipo e um snapshot explícito do
sistema responsável. As políticas padrão reconhecem as famílias ranking.* e
vip.membership. **Não calculam colocações, temporadas ou elegibilidade VIP.**
Não foi criado um ranking artificial com as contas locais. Sem integração que
forneça decisões verificadas, os títulos dessas famílias continuam pendentes.

O ponto de entrada interno é `CityWorld.applyTitleMaintenanceSnapshot(snapshot)`:

```ts
city.applyTitleMaintenanceSnapshot({
  subjectId: city.userId,
  policyKey: "ranking.combat-power",
  revision: 42,                    // revisão monotônica, persistente por política/conta
  publishedAt: now,
  complete: true,                  // decisão completa da política para esta conta
  awards: [{
    titleId: 1,                   // ID já resolvido pelo sistema de ranking
    awardKey: "season-12-award-7", // identidade estável desta concessão
    expiresAt: endOfAward,         // milissegundos absolutos; prazo decidido pelo servidor
  }],
});
```

O método é uma integração de servidor, sem opcode ou endpoint administrativo novo
acessível ao cliente. A validação exige mesma conta, classe compatível, catálogo,
família/tipo da política, IDs únicos, datas válidas e publicação não futura. Toda
a decisão é preparada antes de substituir o save. Família nova precisa registrar
uma política explícita e um serviço que entenda seus requisitos. O mecanismo
recusa usar as famílias de conquistas permanentes como condições de manutenção.

Snapshot parcial ou política ausente não concede nem retira títulos. Revisão
antiga/publicação fora de ordem não substitui uma mais recente. Repetição da mesma
revisão com mesmo conteúdo é idempotente; reutilizar a revisão com outro conteúdo
gera erro. Ordenação dos IDs/campos não muda o significado do recibo. O save
guarda revisão, datas, hash e referências administradas com validação contra os
recibos históricos; não depende de um cache que desapareceria ao reiniciar.

Um snapshot completo retira as concessões administradas pela política que não
estão mais elegíveis. Não retira uma posse substituída por outra origem nem uma
conquista de outro sistema. `awards: []` significa perda comprovada da condição;
ausência de resposta significa integração pendente. A validade absoluta continua
expirando independentemente da disponibilidade do ranking.

Renovação/readquisição exige **nova awardKey**, revisão posterior e prazo explícito.
Repetir a chave anterior não ressuscita um título perdido e não estende a duração.
Reapresentar uma chave histórica depois de outra premiação também não a reproduz:
os recibos de obtenção anteriores continuam no save. A primeira data de obtenção
é mantida. `expiresAt: null` é decisão explícita de manter até perda da condição,
aceita somente para definições cujo Time é 0; não significa permanência de ranking.
Time diferente de 0 exige prazo absoluto e jamais é convertido automaticamente
em horas ou dias, pois a unidade do acervo continua não comprovada.

Não foram resetadas contas reais ou criadas premiações de ranking para teste.
Os testes usam bancos temporários e cobrem expiração online/offline, mudança de
classe, renovação, revisão repetida/antiga, dados parciais, falhas SQL, rollback
externo, preservação de batalhas e retirada de bônus/identidade no protocolo.

## Ajustes locais: missão e pesquisa

O acervo original exige nível 45, cadeia 935 e conversa com Wolf na missão 936.
A versão local disponibiliza a 936 automaticamente no nível 14, sem a cadeia
anterior e com objetivo de alcançar o nível 14. A missão fica concluível; o jogador
ainda precisa resgatá-la para liberar os atributos. A recompensa original é
preservada. Contas existentes recebem a missão ao salvar/reconectar. O resgate
é único, transacional e sincroniza a flag que habilita o ícone de atributos totais.

`reference/titles/unlock-quest.json` preserva a definição original e seu hash de
origem. `scripts/import-title-unlock-quest.ts` reproduz a extração sem rede/cliente.
`quest.ts` aplica o contrato local e altera apenas a resposta de QuestTemps e
QuestCondictionInfos da missão 936; o arquivo original fica intacto e o modo
online não recebe o override. O importador geral ainda valida nível 45 na origem.

A pesquisa é inteiramente local ao Flash e não usa um opcode de busca. O filtro
da janela foi corrigido no módulo 5 completo: com texto, pesquisa títulos visíveis
em todas as categorias, sem diferença de acentos/maiúsculas e normalizando espaços;
sem texto, retorna à aba atual. A seleção passa a usar somente os resultados
filtrados e fica vazia quando não há resultados. O patch e seus gates de auditoria
e AIR estão em `scripts/build-formation-ui.mjs` e `scripts/swf/README.md`.
