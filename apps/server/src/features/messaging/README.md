# Central de mensagens

Ponto único para construir mensagens de sistema destinadas ao próprio personagem.
O controlador recebe texto e apresentação, consulta as políticas e retorna pacotes.
Não acessa banco, moedas, inventário, cliente, sockets ou outros personagens.

```ts
const messages = new MessageCenter(userId);
const notice = messages.notice("Mochila cheia.");
const reward = messages.reward("Você recebeu 500 de ouro.", 120);
const delivery = messages.prepare({
  kind: "error", text: "Recursos insuficientes.", presentation: "center",
});
// delivery.recipientId é o dono da sessão; somente ela recebe delivery.packets.
```

CityWorld mantém adaptadores notice/rewardChat e serializa os pacotes na sessão
existente. Assim, modas, montarias, cosmos, mochila, correio, habilidades, campanha,
labirinto, bots, construções, fazenda e amizades conservam os caminhos de erro.
As modas continuam usando seu contrato notice, sem mudanças no módulo concluído.

Políticas em presentations.ts controlam os canais, nomes, destaque e ordem:

- chat: pacote 83, canal 3, remetente Sistema, sem aviso central;
- center: pacote 83, canal 3, remetente Servidor local, com aviso central;
- alert: pacote 111, canal 7;
- chat-and-alert: ordem já usada nos impedimentos do labirinto;
- alert-and-chat: ordem já usada nas recompensas de baú.

Preservar os atrasos do combate e publicar recompensas somente após a operação
confirmada. Mensagens não podem conceder recursos nem ser usadas como prova de
que uma transação terminou. Não adicionar notificações automáticas aos ledgers:
isso pode anunciar operações revertidas e gerar spam na produção passiva.

Textos existentes de recompensas ficam em text.ts. Novos tipos de sistema usam
prepare e as políticas, sem condicionais por funcionalidade no controlador.
Texto produzido pelo Flash (fazenda, janelas próprias, avisos de correio etc.)
permanece no cliente; não enviar uma cópia pelo chat sem verificar duplicação.

## Aquisições integradas

Impostos, bolsas de ouro, poções de energia, vendas, anexos de correio, missões
capturadas/genéricas e recompensas recuperadas de tempo online entregam um resumo
no chat e no alerta de tela. Moedas, XP e itens do mesmo tipo são consolidados.
Aquisições já anunciadas não são reenviadas no login. Não há anúncio para crédito
zero ou pedido já resgatado.

acquisitions.ts observa o estado antes/depois da operação, antes da sincronização
de produção passiva no persist. Ele não concede nem calcula recompensas. Impostos
informam explicitamente o valor creditado pelo ledger via callback, excluindo a
produção passiva que também pode ser atualizada nessa operação. Os pacotes são
retornados ao cliente somente se a transação que os preparou for confirmada.
Falhas/rollback descartam o resultado junto com as mensagens de sucesso.

Cuidados da fazenda, árvore, compra de sementes e resultados dos bots mantêm as
mensagens nativas. Colheita e roubo recebem um resumo apenas no chat.
Não existem avisos automáticos para todos os lançamentos da carteira.

O Global usa GlobalChat, uma camada separada por GameServer, que entrega pelo
socket autenticado de cada personagem conectado. Os avisos desta central seguem
exclusivos da própria conta. Guilda/Equipe/Privado, custos de cornetas, histórico
persistente e filas offline ainda não são implementados.

## Rejeições e erros

Rejeições explícitas da cidade e interações bloqueadas do tutorial passam por
RejectionFeedback e pela apresentação error da central: canal 3 com aviso central.
Missões explicam aceite, objetivos pendentes ou prêmio já resgatado; cartas,
encontros e recompensas de tempo também explicam os impedimentos. A verificação
das condições recuperadas conserva as mesmas regras e agora fornece o motivo.

O limite transitório de 2 segundos por conta/ação/motivo impede que retransmissões
e tentativas do loop inundem a tela. O cache é limitado a 128 entradas, não é
salvo na conta e não concede nem bloqueia recursos. Logs continuam disponíveis.

Chamadas que já retornavam notice usam apenas logRejection no caminho auxiliar,
incluindo o callback de diagnóstico das modas, evitando uma segunda mensagem.
Pacotes de sincronização, ready/pause/continue atrasados, limpeza idempotente de
slots e marcos automáticos do tutorial continuam silenciosos quando apropriado.
A janela de energia e as respostas específicas das funcionalidades são mantidas.
Erros técnicos inesperados continuam no tratamento do servidor; não são expostos
como SQL, stack trace ou números de opcodes na interface do personagem.

## Política por finalidade

policy.ts associa cada finalidade à apresentação, sem alterar o controlador:

| Finalidade | Apresentação |
| --- | --- |
| Aviso ou erro | Chat com aviso central |
| Erro acompanhado por aviso nativo do Flash | Apenas chat |
| Aquisição manual | Chat e alerta na tela |
| Registro de recompensa, incluindo XP de combate | Apenas chat |
| Orientação de requisito | Chat e alerta na tela |
| Recompensa de baú | Alerta na tela e chat |
| Resumo de produção passiva | Apenas chat |
| Informação exclusiva da tela | Apenas alerta na tela |

Os atrasos e a ordem dos pacotes existentes são preservados. As funcionalidades
concluídas continuam usando seus adaptadores existentes, inclusive as modas.

## Resumo da prefeitura

production.ts lê somente os créditos positivos de ouro registrados como
townhall:production na carteira do próprio personagem. Não concede ouro nem
recalcula produção. Impostos, vendas e créditos de outras fontes não entram.

O resumo reúne os créditos desde o último informe, incluindo a produção offline,
com intervalo mínimo de 60 segundos. Durante uma batalha em andamento, a entrega
é adiada. O próximo tick elegível ou a entrada na cidade entrega o acumulado.

O cursor messageReceipts.production é persistido no save dentro da transação da
operação. Reconectar não repete créditos já informados; rollback não avança o
cursor. Na primeira instalação, o cursor começa no fim do histórico existente,
antes de creditar a produção da entrada atual, evitando anunciar todo o passado.
Não há alteração no cálculo, no limite ou na contabilização do ouro.

## Avisos nativos revisados (passo 5)

FarmLandItem/FarmAnimalItem reagem ao campo result do retorno 4387. No sucesso,
os cuidados geram texto de chat por FarmManager.addChatTip, e a aceleração gera
aviso na tela. Na falha result=1, as telas chamam showFailTip. O servidor mantém
esse retorno e usa native-error para registrar o motivo detalhado apenas no chat,
sem outro alerta central. Rejeições sem posição de terreno mantêm o aviso central.

Colheita e roubo não têm texto de recursos em addChatTip. Somente essas operações
usam o snapshot de aquisição antes/depois, antes do persist e da produção passiva.
O resumo entra no retorno da transação confirmada, apenas para quem coletou; o
dono e os visitantes continuam recebendo somente sincronização e histórico nativos.
Erros e tentativas repetidas não anunciam ganhos; rollback descarta o resumo.

WaterViewContainer já apresenta harvestMsg (146) e pickMsg (106). ShopManager já
mostra o sucesso da compra pelo resultado 1 do retorno 90. MopupManager preenche
o histórico/janela de resultados pelo retorno 4425, inclusive no reconnect. Nenhum
desses retornos recebe uma cópia automática da central. Reabrir histórico de bot
não é uma nova aquisição nem um novo aviso de chat.

Evidências e escopo: reports/messaging-native-review.md. O controlador e os SWFs
permanecem inalterados; esta revisão não exige mudança do cliente.

## Validação final (passo 6)

Os contratos e integrações são cobertos por messaging.test.ts,
acquisition-messaging.test.ts, rejection-messaging.test.ts, message-policy.test.ts
e pelos cenários de fazenda/bots. A verificação TCP autentica duas contas, testa
recibos e erros isolados por socket e reconecta para confirmar que o login não
reenvia o recibo anterior. Falhas SQL induzidas testam rollback antes da entrega.

Relatório e matriz de cobertura: reports/messaging-final-validation.md.
Os avisos não possuem confirmação de leitura nem fila persistente; desconectar
entre confirmar a operação e enviar o pacote pode impedir a exibição do aviso,
sem desfazer os recursos salvos. Os testes de protocolo não substituem a
verificação visual das janelas e animações no AIR.

## Global e filtros

GlobalChat aceita os comandos nativos 8198 (Global) e 15005 exclusivamente no
canal 10. Nome/ID vêm do personagem autenticado; dados de cargo, classe, equipe,
itens e destinatários fornecidos pelo cliente não são retransmitidos. O job do
pacote é zero, evitando que o filtro de profissão do Flash esconda a mensagem
de personagens de outras classes. O cabeçalho identifica o receptor e other_id
identifica o remetente. O remetente recebe somente o mesmo eco que os demais.

O envio é gratuito, limitado a 84 caracteres UTF-16 e uma mensagem a cada
2 segundos por remetente, como no cliente. O texto é tratado como texto, sem
aceitar marcação de links/itens forjada. Mensagens inválidas e canais ainda não
suportados produzem aviso só para o remetente. Mensagens não ficam em fila para
contas desconectadas e não reaparecem ao relogar. O conteúdo não é gravado nas
capturas brutas do servidor.

O core local mantém os botões existentes: Todos (0), Global (10), Equipe (6),
Guilda (5), MSG (3). O histórico e a entrada de novas mensagens usam a mesma
regra: Todos aceita tudo; os outros aceitam somente o canal escolhido. Os avisos
de sistema permanecem em 3, inclusive textos nativos da fazenda. Alertas centrais
e janelas de erro continuam sendo avisos de tela independentes do filtro de chat.
Equipe/Guilda ficam vazios enquanto seus chats não são implementados.

Selecionar Global também seleciona o canal de envio pelo comportamento nativo.
Todos muda apenas a exibição, preservando o canal escolhido no campo de entrada.
Para conversar, selecione Global; os outros tipos de envio não são habilitados.
chat-resource.ts serve o core auditado e atualiza somente a linha do módulo 2
nos índices, em modo local. O modo online continua utilizando o cliente original.
