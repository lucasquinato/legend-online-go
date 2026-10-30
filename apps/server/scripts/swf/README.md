# Âncora para corrigir interfaces Flash

## Continuação avançada do Selo da Alma

`SoulSealPatch.java` mantém o método comum `GoodsHelp.getJewelEffecyByGrade`
protegido e altera apenas a fórmula avançada (nível 80–100, percentual nível*5),
os três métodos de JewelFrame responsáveis pela etapa/cap e os quatro previews
de gemas que exigiam profissão. A regra própria consulta thane.grades e mantém
jewelGrades>=80; não falsifica profissão. A tabela 104 recebe os níveis 81–100
no backend e a tabela comum 15 permanece intacta.

Build: core primeiro (`scripts/swf/build-chat-ui.mjs`), depois módulo 5
(`scripts/build-formation-ui.mjs`). Ambos exigem os gates anteriores e
`SoulSealProbe.as`. `SoulSealTestAliases.java` copia as expressões candidatas
da janela e injeta dependências somente nas cópias de teste; construtores e
recursos de produção fora do contrato permanecem protegidos. O probe confere
percentuais comuns e avançados, requisito 80/80 sem profissão e limite 100.
O mesmo patch alinha o gate de `EquipView.refreshView`: o botão avançado e seu
rótulo usam o requisito 80/80 e `seniorStoreGrade`, sem depender de profissão.
O fixture adicional executa o bloco candidato de visibilidade/texto no AIR,
conferindo os níveis 80, 81, 93 e 100 e o retorno ao ícone comum abaixo do requisito.
O evento já existente `PLAYER_INFO_UPDATE` atualiza essa tela após a progressão;
nenhum custo, item, atributo ou estado de conta é alterado por essa correção.

## Tatuagens

`build-formation-ui.mjs` aplica `TattooUiPatch.java` ao módulo 5 atual, após
os patches já existentes. São quatro métodos autorizados: entrada da aba em
`ArmyFrameII.initView`, tooltips de slots em `TattooView.initView/refresh` e
gate da gravação em `TattooView.setImprintState`. Usa os níveis 70–80 definidos
pelo usuário, sem alterar profissão, missões nem as interfaces de Modas.
O auditor protege os demais métodos, construtores, classes e recursos.
`TattooUiProbe.as` executa os gates e tooltips no AIR; a cópia de baseline deve
reproduzir o bloqueio antigo. `TattooUiTestAliases.java` injeta fixtures apenas
nas cópias de teste, nunca no módulo publicado. O manifesto preserva também os
gates de runas e títulos. A interação completa no launcher deve ser conferida
visualmente pelo jogador; resolução de classes não equivale a esse teste.

A regressão da aba vazia é coberta pelo cenário próprio com `_thaneInfo=null`,
o valor usado pelo construtor real. O gate próprio lê o nível em
`ArmyManager.instance.thane`, preservando o ramo de inspeção. O build também
exige reproduzir #1009 na versão defeituosa preservada e executar o ramo
corrigido sem erro. O contrato adicional compara as duas versões permitindo
alterar somente `TattooView.setImprintState`.

## Prévia de impostos da Prefeitura

`pin-settlement-release.mjs` ancora o módulo 4 na versão `1c1690b9` do índice
original. `build-settlement-ui.mjs` altera apenas `LevyView.refreshView`: a
prévia consulta `ResourceManager.instance.gold.baseYield`, a renda total enviada
no pacote 109. Remove a fórmula antiga de seis vezes a produção-base, fundição
e adicional de fonte mágica, que não representam a regra local de uma hora total.
O restante do método, classes, recursos e tags permanece protegido pelo auditor.
O gate AIR executa o método candidato com rendas distintas e verifica o limite
diário; o baseline precisa reproduzir o valor incorreto.
Os dois gates de nível em `refreshView` usam agora 10, conforme a especificação
da Prefeitura; o probe exige botão e valor disponíveis nesse nível.
As injeções de controles em `SettlementTaxTestAliases.java` são exclusivas das cópias de teste.
O candidato de produção também carrega junto com Modas, Loja, Habilidades e
Ferreiro antes da publicação. Não implica implementação de VIP.

## Visibilidade dos eventos locais

Por solicitação do usuário em 17/10/2026, `EventVisibilityPatch.java` altera
somente `ui.toptoolbar.TopBtnCheckShowHelper.checkIsShow` no core 2: cada
template não nulo fica visível. Os 96 registros originais, seus ícones,
agrupamento, paginação, handlers e condições internas continuam intactos.
Isso expõe eventos para inspeção, sem implementar suas regras no backend.
`build-chat-ui.mjs` inclui o patch e exige `EventVisibilityProbe.as` no AIR:
96 entradas aceitas, sete filhos agrupados preservados e null rejeitado.
O manifesto e o carregamento HTTP exigem esse gate, além das validações
anteriores de chat, batalha, formação, ferreiro, Cosmos e interfaces congeladas.
O relatório de publicação fica em `reports/seasonal-events/visibilidade.md`.

O core inclui uma cópia de `DamageData.extraData` em
`battle.handler.BufferHandler.convertDamageDataToAttackData`, para preservar o
visual nativo de crítico nas curas por efeitos. `HealingCriticalPatch.java`
altera apenas esse método. O build exige auditoria e execução do conversor real
no AIR com `HealingCriticalProbe.as`, em cópia com alias exclusiva de teste.
As regras estão em `reports/batalhas/cura-critica/implementacao.md`.

Este é o ponto de partida para qualquer modificação futura nos módulos do
cliente servidos pelo backend. A versão de referência é a indicada no
**code_md5.dat original**, não um arquivo canônico antigo do cache.

## O que aconteceu

A correção do refresh conservou classes fora do escopo, mas as comparou com uma
base antiga. O módulo 14 antigo tinha 198 classes; o atual tem 477. O módulo 15
antigo tinha 84; o atual tem 123. Preservar o código de uma versão antiga não
preserva a interface validada na versão atual. Em Modas, quatro classes atuais
de refinação/atributos estavam ausentes. A Loja Principal também era antiga.

## Contrato e ferramentas

- `reference/ui-compat/release-lock.json`: caminhos **versionados**, SHA-256 do
  transporte e do SWF decodificado, versão do core e métodos que podem mudar.
- `pin-release.mjs`: lê o índice original e os assets preservados no backend;
  rejeita cache ambíguo, arquivo corrompido e tentativa de trocar a versão fixa.
- `SafeSwfAudit.java` / `audit.mjs`: verifica versão, conjunto completo de classes,
  duplicatas, ABC vazios e ordem dos tags. Todos os tags fora do escopo devem ser
  byte a byte idênticos. Dentro do único ABC permitido, preserva constantes já
  existentes, herança, campos, inicializadores, assinaturas e métodos restantes.
- `MountCurrentPatch.java`: exemplo de edição pontual de uma instrução/handler,
  sem recompilar classes decompiladas nem transplantar um módulo inteiro antigo.
- `build-mount-ui.mjs`: gera em uma pasta temporária, audita, carrega no AIR,
  verifica também Modas e Lojas e só publica os arquivos depois de tudo passar.
- `scripts/probe-mount-runtime.mjs`: teste nativo reutilizável. Usa
  **Loader.loadBytes**, o mesmo caminho do ModuleLoader; `Loader.load(file://)`
  teria outras regras de sandbox. Aceita `--targets=[...]` e `--classes=a,b`.

## Procedimento para o próximo sistema

1. Identificar o módulo e seu token no índice original da versão em uso. Fixar
   seu caminho versionado e hash no contrato; não usar `/cdn/N.png` como base.
2. Identificar as classes/métodos da função e as interfaces compartilhadas no
   mesmo módulo. Documentar uma lista mínima de alterações permitidas.
3. Partir do SWF **inteiro da versão correta**. Não excluir classes para montar
   uma versão menor. Não escolher bases/donores pelo nome simples do arquivo.
4. Preferir alteração pontual de bytecode. AS3 decompilado não é fonte original:
   recompilar pode produzir VerifyError apesar de o SWF ser legível e íntegro.
5. Auditar o candidato. Rejeição por classes, tag, constantes, construtor,
   assinatura ou método fora do contrato deve ser corrigida, não suprimida.
6. Carregar o candidato com o core fixo no AIR. Testar todos os módulos afetados
   juntos, todas as classes críticas e as interfaces já concluídas que compartilham
   os módulos. Não basta validar só a classe que foi alterada.
7. Publicar somente após os gates. Atualizar hash e tamanho no manifesto, conferir
   os bytes servidos por HTTP e reiniciar o servidor local com backup das contas.
8. Reabrir o launcher e conferir visualmente as abas, recursos e callbacks. A
   resolução de classes no AIR não substitui essa validação de interação.

## Comandos atuais

Execute da raiz de `wartune_server`:

```powershell
node scripts/swf/pin-release.mjs
node scripts/swf/build-mount-ui.mjs
node scripts/swf/audit.mjs 14 reference/mounts/local-ui/local-14.swf
node scripts/swf/audit.mjs 15 reference/mounts/local-ui/local-15.swf
npm run test:swf-contract
npm run test:mount-ui
npm run check
```

O contrato atual permite um método de montaria e três métodos de apresentação
da síntese no 14; **nenhuma mudança no 15**. Modas, Loja Principal, Cosmos e as classes das outras funcionalidades
são protegidas. O backend recusa iniciar com um bundle sem os hashes da versão
fixa e a auditoria correspondente ao hash do candidato.

O core 2 tem quatro overrides explícitos de chat: filtro histórico,
filtro de mensagens novas, envio global sem corneta e retirada da restrição de
nível para conversar. `node scripts/swf/build-chat-ui.mjs` parte do core fixo,
audita os demais métodos/tags/classes e executa o teste dos cinco filtros no AIR,
junto com Modas, Loja, Montaria e Habilidades. Só publica depois dos dois gates.
O relatório fica em `reference/chat/local-ui/manifest.json`; nenhuma classe
é removida ou recompilada no core. O probe de teste é um artefato separado.

O mesmo bundle contém uma ponte de despacho da preparação de batalha e treze
ajustes de importação de código para o AIR: nove callbacks de `ResourceModel`,
`GameView.__onComplete`, `BattleOtherResByteLoader.btyeLoadComplete` e o callback
estático `SkillResourceLoader.skillLoadComplete` dos efeitos individuais e
`PetFormationGameView.__onComplete` do preview de formação. O cliente
original só habilitava `LoaderContext.allowCodeImport` quando `DisplayLoader.isDebug`
era verdadeiro. No launcher AIR isso causava `SecurityError #3226`, primeiro nos
efeitos compartilhados e depois nos personagens/animações. Os ajustes mantêm
os offsets e o restante de cada callback; apenas a condição dessa permissão muda.
Não ativam o modo debug global nem alteram as regras dos sistemas do jogo.

O build também testa a importação real pelos callbacks de efeitos comuns,
efeitos individuais de habilidades e de `GameView`.
`BattleLoaderTestAliases.java` expõe entradas públicas em uma **cópia de teste**,
mantendo os corpos de método do candidato. Essa cópia nunca é publicada.
O baseline deve reproduzir #3226 e o candidato deve concluir os quatro carregamentos.
Os resultados ficam em `resourceRuntime` e `baselineResourceRuntime` do manifesto.

A aba atual de Tropas também carrega o preview do personagem por
`yishi.view.tools.PetFormationGameView.__onComplete`. Esse callback tinha a mesma
restrição de `allowCodeImport` e gerava #3226 ao abrir a formação, mesmo com o
carregador da tropa já corrigido no módulo 5. O core inclui a correção pontual
desse callback, preservando a interface atual de quatro formações. O gate
`formation-preview-import-passed` executa seu corpo original em uma cópia de
teste com as dependências inicializadas. Não é publicado o diagnóstico temporário
de LineUpView. Em 16/10/2026, o usuário confirmou previews e troca das quatro
formações funcionando no launcher após esta correção.

## Limites e exceções explícitas

O auditor padrão é estrito para alterações de métodos: não admite renomear,
remover ou adicionar classes, alterar herança, mover tags ou trocar recursos.
Uma função que realmente precise dessas mudanças exige um contrato e um gate
específicos, mantendo a proteção byte a byte do que está fora do escopo. Isso
não autoriza usar uma versão antiga como base do módulo inteiro.

Ao abrir uma janela `Frame`, use sua **chave de estilo** na ComponentFactory,
em vez de instanciar a classe diretamente. A chave pode diferir do namespace:
`mountrefiningsoul.MountRefiningSoulFrame` aplica `core.Frame1` à classe
`mounts.MountRefiningSoulFrame`. O `new` direto omitia moldura, dimensões e X de
fechar, embora os controles internos carregassem. O handler permitido agora usa
`creatComponentByStylename` e mantém o callback original de fechamento/dispose.
Fonte: `reference/mounts/current-soul-ui.xml`, extraído do recurso versionado
`/cdn/ui/zh_cn/xml/xml_d0a3cb68.png` (SHA-256
`f8925fb650e5e94cb4a39ca131f8baec09b9f4b2cfbb9463aebcb28616950dbc`).

`ForgeUiPatch.java` mantém o tamanho dos dois métodos alterados. Em
`store.ComposeView1.initView`, os botões Teseu/Vingador continuam sendo criados,
mas não entram no container/grupo de seleção. Em
`store.compose.ComposeSubListView.refreshData`, as categorias 100/105/115
(receitas Types 9/20/17) passam para a próxima iteração antes de entrar na lista.
As receitas, definições, recursos e demais handlers continuam no módulo. O
builder aplica esse patch depois da correção da montaria, audita os quatro
métodos permitidos e carrega também as classes de síntese no AIR com o core fixo.

`ForgeRecipeFilter.java` filtra acessórios em `ComposeListView.update` e gemas
em `ComposeSubListView.refreshData`. Mantém Gemas da Sorte/Alma da Moda nos
acessórios e apenas gemas de equipamento na árvore de gemas. O guard usa os IDs
de `reference/equipment/gems.json`, sem apagar templates ou receitas, relocando
os saltos dos dois métodos. A publicação exige auditoria e carga no AIR,
incluindo ComposeListView, ComposeSubListView e todas as interfaces congeladas.

A formação de tropas usa atualmente o módulo 5 da versão fixada, com alteração
pontual do carregador AIR de `LineUpFormationItem.__loadedCompleteHandler`.
O transplante seletivo antigo foi substituído; não deve ser reaplicado. A tela
atual conserva suas quatro formações e todos os demais scripts do módulo.

Não alterar gameplay, progressão, moedas, inventário, persistência ou Modas para
compensar um problema de empacotamento. Não executar formatters durante essas
correções. O construtor histórico `MountUiTransplant.java` foi desativado para
impedir a reutilização acidental da estratégia de bases misturadas.

`ForgeFeaturePatch.java` restringe a decomposição a gemas duplas, esconde apenas
os três botões solicitados, mantém cadeados de purificação visíveis e abre molde
divino no nível 50 sem profissão. Os limites de equipamentos comuns são 80 graus
para nível 50/60 e 160 para nível 70/80. O core conserva os limites das demais
categorias. A lista explícita dos métodos está no release-lock; Modas permanece
protegido byte a byte. `ForgeRecipeFilter` também impede antecipação de receitas
dos seis grupos, respeitando exatamente o novo nível mínimo.

`node scripts/test-forge-runtime.mjs` executa getters e filtros candidatos no AIR
com templates de teste, verificando os limites e recusando categorias indevidas.
`ForgeTestTemplates.java` altera apenas o getter da tabela numa cópia isolada:
essa cópia e seus templates nunca são publicados. O build do core exige esse gate
além dos testes de chat, batalha e Cosmos. O teste não substitui a interação visual
do jogador no ferreiro.

`npx tsx scripts/test-affix-progression-runtime.ts` gera as definições locais de
purificação e usa o ClassFactory do core no AIR para interpretar os 3.840 pares
de habilidades/propriedades. Confere IDs, estrelas (até 100), nomes e valores.
O fixture é lido apenas pelo probe de teste; nenhum SWF de produção é alterado.

## Cosmos: exceção explícita de nível 80

`pin-cosmos-release.mjs` ancora também o módulo 5 atual (`13cbe084`) no índice
original. `CosmosSlotPatch.java` muda apenas `StarManager.moveToEquip` no core 2
e `EquipStarListView.initView` / `__refreshStarTroughInfo` no 5. O décimo slot
passa a depender exclusivamente do nível 80; o nono mantém missão 1802 + nível 60.
A atualização de Cosmos avançados abaixo substitui os bloqueios de refinação e Sagrados por nível comum.

`build-chat-ui.mjs` aplica a mudança após os patches de chat/batalha e mantém
todos os seus gates. O gate adicional usa `CosmosSlotTestInterceptor.java`
somente em uma cópia de teste: intercepta o envio ao socket, preservando
byte a byte o corpo candidato de `moveToEquip`. `CosmosProbe.as` executa no AIR
a escolha do slot dez com um Cosmo comum e um composto, nível 80 e sem missão
ou profissão. Essa cópia nunca é servida.

`build-formation-ui.mjs` parte do módulo 5 inteiro da versão fixada, conserva
o ajuste de importação AIR do renderer de formação, aplica os dois métodos de
Cosmos e o filtro de pesquisa de títulos e audita os quatro métodos permitidos. O teste nativo carrega também
Cosmos, Habilidades, Modas, Montaria e Loja antes de publicar. Nenhuma classe
é transplantada. Para reproduzir: ancorar com `pin-cosmos-release.mjs`, executar
`build-chat-ui.mjs`, depois `scripts/build-formation-ui.mjs` (sequencialmente).

`RuneLevelGatePatch.java` altera somente três métodos das telas atuais de runas:
promoção, disponibilidade de upgrade avançado e validação da barra cheia. A regra
local libera esses requisitos no nível comum 80, consultando `thane.grades`;
`PlayerInfo` não possui esse getter. Não falsifica profissão avançada globalmente.
Compras rápidas e custos continuam nos handlers originais, integrados pelo backend.
O builder inclui `RuneGateProbe.as`: o candidato permite evolução avançada no 80,
mantém bloqueios de runa não aprendida/máxima e requisitos básicos, e encaminha
upgrade da barra avançada cheia. O baseline deve falhar no desbloqueio do nível 80.
As substituições de dependências de UI em `RuneGateTestAliases.java` existem apenas
nas cópias de teste; os corpos dos métodos candidatos permanecem intactos nelas.

`TitleSearchPatch.java` altera somente `appell.AppellFrame.refreshList` no módulo 5:
consulta com texto percorre as categorias visíveis, normaliza espaços/acentos e
seleciona apenas resultados filtrados. Campo vazio restaura a aba atual. O builder
audita contra a versão fixada, carrega todas as interfaces compartilhadas no AIR e
executa `TitleSearchProbe.as` com dependências de UI simuladas apenas em uma cópia
de teste (`TitleSearchTestAliases.java`). O corpo candidato do filtro é mantido
nessa cópia. O baseline deve falhar e o candidato deve passar buscas por trecho,
maiúsculas, acentos, espaços, título fora da aba, nenhum resultado e limpeza.
Construtores, campos e métodos de produção fora do filtro permanecem protegidos.

## Cosmos avançados por nível comum

O contrato inclui `cell.view.starbag.StarBagCell.data#set` no core e
`star.HoroscopeFrame.initView` no módulo 5. O sufixo `#set` seleciona somente
o setter no auditor, preservando o getter de mesmo nome byte a byte. O patch
substitui apenas a condição da refinação no setter e nos dois métodos já
autorizados de EquipStarListView, usando `int(grades / 10)`; HoroscopeFrame
mostra a elevação quando `grades >= 80`. Os demais gates da versão, a pesquisa
de títulos, o ferreiro e a importação AIR continuam protegidos. O build mantém
todos os testes nativos anteriores antes de publicar. A semântica de servidor
e as escolhas locais aprovadas estão em `reports/cosmos/avancados.md`.


## Residência e Navegação

`node scripts/swf/pin-residence-release.mjs` fixa o módulo 3 da mesma versão do índice.
`node scripts/swf/build-residence-ui.mjs` gera os dois derivados locais:
- Módulo 3: somente `farm.FarmEnterNewFrame.__onBoatBtnClick`, nível 80 → 50.
- Módulo 15: somente `view.subshop.NavigationShopFrame.refreshView`, mantém o
  botão de renovação paga disponível. O tempo original de renovação natural não
  existe no catálogo recuperado; não exibir uma renovação gratuita fictícia.

Ambos preservam as demais classes, tags e métodos. A publicação exige auditoria
mais carregamento no AIR junto de Navegação, Fazenda/Pastagem, Modas, Loja e
Habilidades. Os manifestos ficam em `reference/residence/`; HTTP aplica esses
índices depois dos índices das demais interfaces, sem alterar o modo de captura.

### Complemento funcional de Residência (18/10/2026)

O módulo 3 permite também FurnitureBagCell.buyFurnitureCall, HouseUIView.__onBonfireClickHandler e HouseUIView.farmStatusChange: compra nativa, coleta de ouro e rótulo, respectivamente. O gate de Navegação permanece em 50. São quatro métodos autorizados, preservando 1.309 classes e recursos fora do escopo. O build exige também resolução de HouseUIView, FurnitureBagCell, FurnitureLayer e HouseStoreView no AIR; isto não substitui teste visual da casa. Parâmetros provisórios ficam em src/features/residence/policy.ts e o relatório atual em reports/residencia/implementacao.md.

### Importação de monstros da campanha no AIR (19/10/2026)

O log real do launcher mostrava dois SecurityError #3226 por entrada na campanha. SingleCampaignNpcAvatarView.__loadedCompleteHandler criava um LoaderContext sem allowCodeImport antes de loadBytes. ResidenceAccessPatch acrescenta somente essa permissão na pilha do contexto original. É o quinto método permitido do módulo 3. Construtores e todas as classes/tags fora do escopo permanecem protegidos.

O build agora exige CampaignImportProbe.as no AIR: a cópia de teste do baseline deve reproduzir #3226 e o candidato deve importar uma classe executável e concluir o callback original. CampaignImportAliases.java altera somente o construtor e campos da cópia de teste para injetar dependências; o callback testado permanece intacto. Nenhuma dessas injeções é publicada. Evidências em reference/residence/local-ui/campaign-import-runtime.json. O carregamento conjunto continua cobrindo Residência, Navegação, Modas, Loja e Habilidades.

### Animações da Pastagem no AIR (20/10/2026)

`FarmAnimalImportPatch.java` altera somente `farm.view.FarmAnimalItem.__onComplete` no core 2 fixado: habilita `LoaderContext.allowCodeImport` imediatamente antes do `loadBytes` original. Não altera ações, dados dos animais, animações, Modas ou outros métodos. O build do core mantém todos os gates anteriores e acrescenta `test-farm-animal-import.mjs`: baseline precisa reproduzir #3226, candidato precisa carregar e instanciar as classes das quatro animações reais preservadas (vaca, ovelha, cavalo e cervo). A cópia de teste expõe o callback e injeta o loader por um construtor mínimo; nunca é publicada. O corpo do callback permanece idêntico ao do candidato. Manifesto/HTTP exigem o gate `farmRuntime` e o auditor protege as demais classes e recursos.


## Sistemas sociais (20/10/2026)

`build-social-ui.mjs` remove somente gates de nível dos nove métodos sociais
explicitados no contrato do core. O módulo 9 usa a versão 177f9627 integral.
Vinte e um métodos de casamento adaptam acessos ao modelo do core fixo por uma
classe nova isolada `SocialMarriageBridge`. As classes MarriageData, RingInfo,
HappyInfo e GodTreeInfo são as originais do core; não se duplicam nem transplantam.
A ponte converte o snapshot 49100 em instâncias nativas tipadas e envia os mesmos
comandos nativos. Nenhuma classe de Modas é alterada.

A adição única está explicitada no release-lock. SocialBridgeAudit comprova o
conjunto original mais essa classe e seu ABC exato. O auditor padrão recebe uma
cópia sem o ABC adicionado e protege todas as classes originais e recursos.
O gate AIR reproduz o bloqueio original de nível e executa equipes, privado,
entrada de casamento, adaptação tipada, inicialização real do anel e proposta
no nível 1. Construtores/dependências simplificados existem apenas nas cópias de
teste; o candidato publicado conserva seus construtores originais.


## Salões de casamento locais (21/10/2026)
`WeddingRoomsPatch.java` altera somente `MarryRoomListFrame.initItem` e
`refreshView`: inicializa os quatro cartões nativos com info=null e limpa os
cartões antigos antes de aplicar a lista atual. Construtores, recursos, setter
`MarryRoomItem.info`, entrada no salão e classes de Modas permanecem protegidos.
`fix-wedding-rooms.mjs` publica a correção sobre o módulo 9 atual e audita tanto
o delta de dois métodos quanto o conjunto completo contra a versão fixa.
`build-social-ui.mjs` inclui a mesma correção para builds futuros.
`test-wedding-rooms.mjs` reproduz cartões antigos no baseline e executa a
transição vazio → 6 salões → 1 salão → vazio no AIR. As dependências gráficas e
construtores simplificados existem somente nas cópias de teste, para conferir
as atribuições reais dos dois métodos; não substituem inspeção visual no launcher.
O gate social anterior e o carregamento conjunto com core, habilidades, modas e
loja continuam obrigatórios. O backend recusa manifesto sem o gate dos cartões.
O servidor não reapresenta registros 4662 de cenários capturados; o registro real
usa IDs persistentes de casamento, prazo e tombstones de encerramento.


## Confirmação matrimonial e entrada fria (21/10/2026)
`WeddingConsentPatch.java` altera somente `MarryConfirmFrame.addReward`,
`dispose` e `__frameResponse`. Evita template zero dos campos legados ausentes,
alinha o preview ao anel inicial de grau 1 e envia recusa apenas no fechamento
explícito. `SocialMarriageBridge` usa MarriageData nativo antes da resposta,
sem consultar campos inexistentes de MarryInfo. `test-wedding-consent.mjs`
reproduz a prévia inválida no baseline e executa as três qualidades e respostas
nativas no AIR; suas dependências gráficas são fixtures exclusivas de teste.
`test-social-ui.mjs` exige entrada fria e inicialização do anel. O build social
mantém os gates de salões e módulos compartilhados. `fix-wedding-consent.mjs`
publica sobre a versão atual somente depois das auditorias e desses gates.
O probe comum aceita --library apenas para substituir a biblioteca por cópia
instrumentada de teste; nenhuma biblioteca publicada é alterada.


## Validação de saltos do módulo social
`SocialUiPatch.java` usa `MethodBody.replaceInstruction` ao redirecionar
MarrySender: editar operandos diretamente pode aumentar seu tamanho e invalidar
saltos. O erro #1021 real foi localizado em MarrySatisfactoryRateView.
`SocialBytecodeAudit.java` valida os destinos de salto de todos os métodos e
vincula o relatório ao SHA-256. Os builds sociais e o carregamento do backend
exigem esse relatório e o gate `social-marriage-happy-bytecode-entry-passed`.
O gate executa o handler original de felicidade em cópia de teste, sem substituí-lo.
A confirmação de login só é enviada após o aviso de cena pronta 5017/8516,
uma vez por conexão; o bootstrap não tenta abrir a janela durante os recursos prioritários.


## Janela matrimonial com estilos reais
`WeddingConsentPatch` inclui também `MarryConfirmFrame.initView`: reaproveita
um estilo de texto existente para PayTypeTxt e instala o alias gráfico do botão
de anel pela ponte isolada. `test-wedding-full-window.mjs` carrega os estilos
originais e as quatro bibliotecas visuais, sem substituir construtores/controles.
O baseline pre-full-window reproduz o estilo ausente; a candidata deve abrir
três qualidades e reabrir a primeira com display e dimensões válidos. Os fixtures
alteram apenas traduções e dados externos de configuração, nunca os controles.
O manifesto/backend exige fullWindowRuntime ligado ao SHA da candidata.
