# Labirinto e abismo

O servidor implementa 100 pisos do labirinto (8001–8100) e 30 do abismo
(8101–8130), com progressos separados. O runtime usa exclusivamente
`reference/labyrinth/content.json`, dentro do backend.

`scripts/import-labyrinth-content.mjs` compila cenas, inimigos, ações e prêmios
das capturas preservadas de 11–13/10/2026 e tabelas copiadas para o backend.
Os 130 mapas possuem cenas e batalhas capturadas. Existem 50 templates de
chefes e 26 baús. Os hashes das capturas ficam no conteúdo gerado.

## Fluxo

- O abismo (pisos 101–130) exige simultaneamente nível 80 e recorde de 100
  pisos vencidos no labirinto normal. A validação é compartilhada pela entrada,
  retomada, encontros e bot. O recorde é permanente: redefinir a rodada normal
  não obriga a repetir os 100 pisos para liberar novamente o abismo.

- Entrar envia criação da cena, nodes e personagem no mesmo envio ordenado,
  antes de o mapa em cache inicializar o controle do jogador. A latência de
  1392 ms da captura não é um requisito do protocolo. O pedido 5038 prepara
  somente os recursos dos inimigos, como no
  online. Ele pode chegar antes da entrega do snapshot quando o mapa está em
  cache; não deve antecipar 131 nem atualizar nodes que ainda não existem.
  Não recria os atores, evitando as cópias sobrepostas no Flash.
- O aviso de estado 5035 não reproduz a resposta capturada do piso 1. Entrada
  e vitória já entregam a cena atual; respostas de consultas genéricas não
  podem reenviar listas/updates de atores ou fog antigos dentro do labirinto.
- Cada combate usa os inimigos, vida, posição, skills e atributos das tabelas
  daquele piso, com o personagem e as tropas atuais da conta. O motor de
  combate é o mesmo das campanhas locais e ainda aproxima a fórmula original
  de dano; não é uma reprodução completa de todos os efeitos de status.
- Iniciar uma batalha marca o monstro como ocupado (estado 4). Vitória entrega
  primeiro o resultado 4103, depois 4373, os dois updates 128 completos
  (monstro oculto e portal ativo) e finalmente posição/estado 131. Isso impede
  restaurar colisões enquanto o monstro antigo ainda está ativo.
  Derrota restaura o encontro.
  Vitória dá XP uma vez, oculta o monstro e libera o portal. O piso só muda
  quando o personagem entra no portal. Sair ou reconectar preserva a vitória.
- Derrota não dá XP nem abre o portal; é possível tentar novamente.
- A missão 1840 (Labirinto Subterrâneo) fica concluída imediatamente ao vencer
  o monstro do primeiro piso normal. Não exige portal nem segundo combate.
  Servidor e tabela local do Flash usam a mesma meta 1/1. O cliente verifica
  maxIndex por conta própria; alterar só is_complete no servidor não basta.
  Vitórias históricas também satisfazem o objetivo após redefinir uma rodada.
- Pedidos duplicados de chegada durante um combate não reenviam preparação.
  Uma preparação atrasada de combate já encerrado é descartada no transporte.
  O callback 5035/state=4 reaplica os estados atuais sem recriar atores.
  Contato com monstro vencido também sincroniza nodes e personagem, sem abrir
  outra batalha, reviver inimigos, avançar piso ou conceder XP adicional.
- Cada vitória anuncia o XP real e o piso no canal INFO do chat (83/canal 3),
  após o resultado da batalha, como na campanha. Não há aviso em derrota ou
  repetição de consulta. A coleta do baú mantém 111/canal 7 na tela e também
  registra a mesma lista de recursos em 83/canal 3, sem duplicar o recebimento.
- Baús exigem vitória, são coletáveis uma única vez e persistem como ocultos.
  Tentar coletar antes da vitória avisa na tela e no chat que é preciso
  derrotar o inimigo. Em pisos com baú, o portal exige sua coleta antes de
  avançar ou encerrar o percurso; a tentativa bloqueada também avisa na tela
  e no chat. Pisos sem baú mantêm a passagem liberada após a vitória.
  Moedas do labirinto passam pelo CurrencyLedger; itens passam pelo Inventory.
  Itens são enviados para a mochila comum (bolsa 1), sem herdar a bolsa interna
  34 de algumas capturas. A coleta envia 111/canal 7 com nomes e quantidades,
  usando o aviso original do Flash. Mochila cheia desfaz todo o recebimento e
  mantém o baú disponível. O reparo administrativo de drops antigos fica em
  `scripts/repair-labyrinth-drops.mjs` e exige servidor parado/cria backup.
  As gemas conservam o nível do piso, mas o atributo é sorteado entre os oito
  tipos básicos com chances iguais (randomInt), conforme regra fornecida pelo
  usuário. São duas gemas na entrada comum e quatro na dupla, inclusive no
  abismo. O resultado é guardado por baú para que crédito, contabilização e
  mensagens usem o mesmo sorteio. Os demais drops usam as definições importadas.
- Nos pisos 100 e 30, o portal tem destino 0: encerra o modo e volta à cidade,
  sem passar automaticamente do labirinto para o abismo.
  A saída manual também envia 4425/status 10/sweep_type 3, usado pelo cliente
  para abrir a janela de resultados após chegar à cidade. O relatório é um
  resumo do XP e dos itens/moedas realmente recebidos na rodada, sem novo
  crédito de recursos. Meu Recorde usa pisos vencidos, sem somar o próximo
  piso disponível: máximo 100 no labirinto e 30 no abismo.
- Entrada com recompensa dupla consome 1 chave 208008 no labirinto ou 3 no
  abismo. Retomar não consome chaves. Os prêmios capturados eram duplicados;
  a entrada comum recebe metade. O multiplicador permanece durante a rodada.

## Redefinição e bot pelo cliente

O comando 8299 redefine somente o percurso selecionado. Limpa pisos, baús e
contadores da rodada, preservando recorde histórico, personagem e prêmios já
creditados. Cada modalidade permite iniciar uma nova rodada por dia, no fuso
America/Sao_Paulo, conforme regra confirmada pelo usuário. Redefinir no mesmo
dia não concede outra entrada; retomar uma rodada existente continua permitido.
Na virada do dia, uma rodada parcial mantém seu piso, baús e identificador.
Retomá-la não consome a chance do novo dia. Após concluir ou redefinir essa
rodada, a chance atual permite começar no piso 1. Rodadas concluídas são
renovadas na entrada seguinte, se a chance diária estiver disponível.
Essa entrada consome a chance atual e, se dupla, as chaves; recorde e recursos
já recebidos são preservados. Chances não acumulam: o limite é uma por dia.
Uma rodada concluída não bloqueia os dias seguintes. O bot usa o recorde
histórico: vencer até 79 libera bot até 79; vencer 100 libera os 100 pisos.
O limite diário não foi capturado no online. Não há custo de redefinição nas
evidências do cliente, portanto a redefinição local é gratuita.

`bot.ts` atende 8528/sweep_type=2: iniciar, acelerar, consultar e encerrar.
Usa `Tower_Sweep_Gold=1000` e `Tower_Sweep_Time=6`, recuperados de ConfigInfos,
por piso. Só aceita destinos até o maior piso anteriormente vencido na mesma
modalidade. Se a rodada anterior estiver concluída e a chance atual disponível,
o bot inicia uma nova rodada. Caso esteja parcial, percorre os pisos restantes.
O ouro é reservado no início pelo CurrencyLedger; encerrar devolve a parcela
dos pisos pendentes. Retomar cobra somente os pisos restantes e não cobra
novamente a chave da rodada. Acelerar custa um diamante por minuto restante,
arredondado para cima, na moeda indicada pelo cliente. Benefícios especiais
de aceleração gratuita por contrato/VIP não foram reconstruídos nesta etapa.

O relógio persiste e é liquidado ao reconectar. Cada piso concede XP uma vez;
baús dos chefes entregam moedas e itens pelos mesmos serviços do jogo manual.
Mochila cheia desfaz a recompensa inteira e mantém o bot pendente até haver
espaço ou o jogador encerrá-lo. Bots de campanha e labirinto não executam em
paralelo. Os resultados intermediários usam status 0: status 9 faz o handler
do Flash retornar antes de atualizar a interface.

Testes verificam redefinição diária, todos os 130 pisos via bot, isolamento
entre modalidades, pausa, retomada, aceleração, progresso offline, mochila
cheia, chave ausente e rollback de banco. A validação visual permanece a cargo
do teste no launcher.

## Reset administrativo e validação

`node scripts/reset-labyrinth.mjs --dry-run` verifica as alterações sem gravar.
Sem a opção, exige servidor parado, cria backup SQLite e reseta somente os
dois percursos de `pirata_teste` e `pirata_teste_2`. Não remove personagens,
níveis, equipamentos, moedas, missões ou modas. Uma rodada recebe identificador
novo, preservando o histórico de moedas sem impedir os novos prêmios.

`test/labyrinth.test.ts` percorre os 130 pisos com mago e arqueira em bases
isoladas, usando uma fonte de atributos forte para verificar o fluxo inteiro
sem reduzir os inimigos. Também verifica baús, retomada, duplicação de prêmio,
consumo das chaves, rollback e derrota. Esses testes não certificam equilíbrio
de dificuldade para personagens de nível baixo nem substituem o teste visual
do Flash. O código de modas não foi modificado.
