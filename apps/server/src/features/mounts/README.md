# Montarias

Estado autoritativo por conta em `CitySave.mounts`. O módulo não importa a
coleção, saldo ou progresso de uma captura online. Não acessa a pasta do cliente.

## Organização

- `content.ts`: catálogo recuperado e tabelas de progressão.
- `state.ts`: treinamento, coleção, validade, estrelas, reis, alma e loja.
- `feature.ts`: validação, consumo, pagamentos atômicos e fonte de atributos.
- `protocol.ts`: comandos 8529/8530 e respostas, incluindo paginação da coleção.
- `ui-resource.ts`: módulos Flash locais 14/15 e atualização dos manifestos.
- `catalog-overrides.ts`: correções locais compartilhadas por catálogo,
  inventário e tabelas enviadas ao cliente, preservando o acervo original.
- `tutorial-quests.ts`: sequência local do nível 16 e seus textos/recompensas
  enviados ao cliente, sem alterar SWFs.

## Missões introdutórias do nível 16

A missão 2800, Sua primeira montaria, aparece automaticamente no nível 16.
Exige clicar uma vez em Montar enquanto a missão está aceita. Não é necessário
desmontar. Ao resgatar: 10.000 ouro, 10.000 XP e 10 Pedras Bestiais. O botão no
estado desmontado recebe o rótulo textual Montar pelo estilo local da versão
fixa; Descansar e seu comportamento de desmontar permanecem intactos. Não há
alteração de bytecode/SWF para esse rótulo.

Após o resgate aparece a missão 753, Adestrar sua montaria, agora com objetivo
de consumir 10 Pedras Bestiais no treino comum de qualquer atributo. Acumula
usos entre atributos e sessões; apenas o consumo real de pedras conta, incluindo
pilhas/bolsas aceitas pelo inventário. Diamantes e treino de Reis das Feras não
contam. Recompensa: 10.000 ouro e 10.000 XP. A antiga recompensa/condição de 753
é substituída nas tabelas locais, mantendo seu histórico de resgates anteriores.

Ambas usam o fluxo de resgate atômico existente, CurrencyLedger, progressão e
inventário. Falha no save desfaz progresso/prêmio; missões resgatadas não voltam.
Contas existentes não recebem crédito retroativo por ações anteriores.

## Correções locais do catálogo

O item 2180061 é Carta do Mamute, ativa 7005 permanentemente e usa o ícone
`mount_elephant.png`, já preservado no cache. O item 2180161 permanece Cartão
do Leopardo Congelado e ativa 1147. Ativações anteriores não são removidas.
Dragão da Masmorra (6002) e Rena Mágica (6004) não reutilizam as cartas de Dora
e Leão do Gelo: adotam temporariamente compra direta por 1 diamante, igual ao
Dragão Dourado (1118). O método existente permite vinculados quando solicitado
pelo cliente. Essas alterações também são aplicadas ao tempinfos somente no
modo local, sem modificar os recursos originais nem os SWFs.

## Regras implementadas

- Liberação no nível 16. Treinamento independente de força, inteligência,
  físico e proteção, com 10 XP por pedra e 10% de chance de 50 XP **por pedra**.
  Atributo bruto do treinamento = grau individual × 5.
- Limite individual = menor entre 2500 e
  `20 × grau geral + soma de ExpandLevel das montarias válidas`.
  O grau geral segue o XP somado dos quatro atributos na tabela 19.
  Isso explica o limite 3075 capturado: grau 8 e expansão 2915; localmente
  prevalece o teto 2500 solicitado.
- Consome pedras primeiro, depois diamantes vinculados (se autorizado pelo
  comando), depois diamantes, a 5 por pedra ausente. Preserva excedentes quando
  atinge o limite. Materiais seguem a política compartilhada da mochila,
  inclusive bolsa de tesouros e proteção. Pagamentos usam CurrencyLedger.
- Montarias ativadas contribuem para atributos mesmo desmontadas ou sem serem
  a aparência escolhida. Trocar aparência não muda a classe nem o inventário.
  Cada fonte entra uma vez na conversão geral dos atributos primários.
- Cartão temporário estende a validade; permanente transforma propriedade
  temporária em permanente. Repetição permanente convertível rende
  `Power × 4` Essências da Fera por cartão. A confirmação/cancelamento já existe
  no cliente. Cartões com Refresh=-1 não permitem conversão.
- Expiração é calculada por relógio, inclusive offline, e atualiza atributos,
  lista e aparência durante a sessão. O histórico de propriedade é preservado.
- Estrelas no nível 70: primeiro refinamento simples gratuito (compatibilidade
  com `firstBless` do cliente), depois Armação da Fera, 1 ou até 10 tentativas.
  Chance ordinária 5%; bênção garante sucesso ao atingir o alvo da tabela 37.
  StarAddition é o bônus absoluto da estrela atual, sem somar todas as entradas.
- Reis das Feras: ativação no nível 70, item 2131500; treinamento separado até
  180, **50 XP por pedra**, tabela 109, +5 por nível nos quatro primários.
  Os 16 lotes capturados confirmam a progressão sem sorteio de bênção de treino.
  O campo separado `extra_star`/Adicionar usa o padrão online observado de 100%,
  inclusive no nível zero. Fórmula: básico (template + ganho por nível) +
  `floor(básico × Adicionar / 100)`. No nível 180: 1000 + 1000 = 2000 em cada
  primário por Rei. A política capturada está em `reference/mounts/king-policy.json`.
- Refino espiritual no nível 80: item 208070, 1 XP por unidade, custo de cada
  passo na tabela **146**, distribuição entre os quatro menores graus até 80.
  Tabelas 144/145 definem os percentuais. Bônus de cada linha:
  `ceil(min(ceil(brutoMontaria × passiva / 100), 100000) × percentualLinha / 100)`.
  Não multiplica equipamentos, modas, santuário ou a base natural.
- Loja paga Essência da Fera (token 14 / anexo -3000) e entrega o cartão na
  mochila. Somente ofertas com preço observado ou definido na tabela estão
  disponíveis. Atualização custa 999 diamantes. Coleção/pontos não são moedas.
- Montaria voadora montada registra capacidade aérea em `mounts.mobility`;
  desmontar ou expirar atualiza a capacidade. Velocidade não altera iniciativa.

## Pendências deliberadas

O percentual adicional dos Reis das Feras foi integrado com a fórmula do
cliente e a política de 100% confirmada nas capturas. Não existe curva recuperada
que o vincule ao nível; o percentual próprio é independente. Aquisição de voo e ações de voo
dependem do futuro sistema de exploração; o comando pendente não consome itens.
Não foram inventados preços para cartões sem tabela/captura.

## Evidências e validação

Runtime: `reference/mounts/content.json`. Originais e versões locais Flash:
`reference/mounts/`. O construtor `scripts/build-mount-ui.mjs` transplanta apenas
as classes de montarias e compara todos os scripts externos ao feature:
**189 no módulo 14 e 81 no módulo 15 permanecem idênticos**, incluindo modas e
a janela legada de conversão de montarias.
O acesso ao refino abre a classe recuperada diretamente, pois o core preservado
roteia essa aba para um namespace de outra versão.
O botão recebe uma alteração direta nas instruções AVM2, sem recompilar a
classe inteira. O construtor e os outros 45 métodos do painel preservam os
bytes originais; o construtor verifica essa condição antes de publicar o SWF.
Blocos ABC vazios são removidos e rejeitados antes da publicação: apesar de
serializáveis, provocam encerramento nativo no AIR. `npm run test:mount-ui`
carrega os dois módulos juntos no runtime preservado e resolve suas classes.
O teste usa `Loader.loadBytes`, como o ModuleLoader; importar por URL de arquivo
introduziria uma diferença de sandbox e não seria um teste equivalente.

`test/mounts.test.ts` e `test/mount-city.test.ts` verificam cálculo, consumo,
limites, validade, loja, moedas, rede, reconexão e rollback. A validação visual
no launcher ainda deve ser feita pelo jogador; os testes não a substituem.
