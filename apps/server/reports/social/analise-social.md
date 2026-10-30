# Análise do sistema social

Inspeção estática do cliente e do servidor em 20/10/2026. Nenhum código de jogo ou estado de conta foi alterado. A fonte decompilada current2.swf tem SHA-256 6a758ea0e997bd8b88d1354cecb49ec4eb90620ced8635f36f32c5cc9c64fa75, igual ao core original fixado no release-lock. Os menus e gerenciadores analisados não fazem parte dos overrides locais de comportamento.

## Situação geral

Existe um núcleo social local funcional: personagens reais, pedidos e aceitação de amizade, remoção, presença online/offline, fila de notificações e integração com Fazenda/Pastagem, árvore, casa e Navegação. Isso ainda não representa o sistema social completo do cliente. Equipes livres e casamento não têm implementação no servidor; grupos de amigos, bloqueios e estados de IM também estão incompletos.

A comunicação já usa o TCP nativo do jogo. Não é necessário introduzir WebSocket para implementar esses recursos no cliente atual. local_events é uma fila persistente de notificações sociais, não um histórico de mensagens privadas.

## Menus ao clicar em outra pessoa

Há dois componentes principais: chat.view.ChatItemMenu (nome no chat) e yishi.view.community.PlayerMenu (personagem, amigos e outros contextos). Não existe uma lista única e invariável. Contexto, próprio personagem, relações, servidor de origem, nível, estado civil, permissões e parâmetros passados ao construtor controlam visibilidade e disponibilidade.

| Opção | Cliente: comportamento esperado | Servidor local hoje |
|---|---|---|
| Privado/conversar | Abre IMManager.createIMFrame; envia 15023 | Implementado parcialmente: exige os dois jogadores conectados no Reino do Céu |
| Adicionar amigo | Solicitação e aceite; relation=1 | Implementado, com relação bilateral persistente |
| Excluir amigo | Remove a relação, com confirmação visual | Implementado; remove as duas direções e pedidos pendentes entre o par |
| Copiar nome | System.setClipboard | Função do próprio cliente; não requer servidor |
| Lista negra | Adiciona relação de tipo 2 | Não implementado; servidor rejeita relation diferente de 1 |
| Visualizar personagem/informações | Consulta informação simples e depois exército/equipamentos públicos | Implementado; possui limitações de presença e de campos sociais |
| Convidar/formar equipe | FreedomTeamManager.inviteMember, convite e aceite | Não implementado no servidor |
| Solicitar entrada na equipe | FreedomTeamManager.joinTeam, decisão do líder | Não implementado no servidor |
| Seguir jogador | Define followId e envia LOCK_TEAM_FOLLOW_TARGET internamente | Código no cliente; não há serviço de equipe local que sustente o fluxo completo |
| Expulsar/transferir liderança | Operações contextuais de equipe/sala | Não implementadas como equipe social local |
| Nomear | O handler __appointBtnHandler do PlayerMenu analisado está vazio | Não presumir funcionalidade apenas pela existência do botão |
| Mover amigo de grupo | Criar/renomear/excluir grupos e mover contatos | Não implementado; servidor usa group_id=0 |
| Remover dos recentes | Remove contato recente no cliente | Ação local do cliente, não exclui amizade nem histórico central inexistente |
| Convidar para guilda | ConsortiaController, condicionado a direitos/contexto | Sem serviço de guilda local implementado |
| Casamento/pedido | Abre pedido em MarryManager; botão condicionado a solteiro e nível 36 | Interface presente, sem fluxo matrimonial no servidor |
| Duelo/PK no Reino do Céu | Convite, aceite e preparação de batalha | Implementado, independente de amizade e de equipe |
| Atacar em mapa de campanha | Fluxo de PvP de mapa, com validações próprias | Não confundir com o duelo do Reino do Céu; não há implementação geral desse fluxo social |

Detalhes de disponibilidade: privado e adicionar amigo possuem verificações de nível 6 nos handlers originais desses menus. O patch de conversa global não elimina automaticamente esses gates. O botão PK do menu de chat é condicionado a SPACE_SCENE. Opções de convite de equipe são condicionadas pelo contexto que cria o menu. Em contextos entre servidores, várias opções são desabilitadas ou usam protocolos distintos.

## Amizade, busca e presença

SocialFeature persiste local_friends, friend_requests e local_events. Um pedido unilateral não concede acesso de amigo; ao aceitar, grava as duas direções da amizade. Há proteção contra próprio personagem e contra IDs inexistentes. A inicialização limpa referências a contas inexistentes e usa dados locais em vez de contatos herdados da captura.

O login/desconexão publica presença para amigos pelos eventos 160/161. A lista fornece nome, classe, sexo, nível e poder. A consulta de recomendação/busca é simplificada: apresenta perfis locais e não implementa integralmente os filtros e a paginação sugeridos pela interface.

Limitações: relation_grade=1, relation_gp=0 e group_id=0 são valores fixos. Não há evolução de afinidade, classificação por intimidade nem grupos personalizados persistentes. O tipo relation=2 da lista negra é rejeitado, e o envio de IM não consulta uma tabela de bloqueios. Não foi encontrado um fluxo completo de recusa explícita de pedidos de amizade.

## Privados e histórico

GlobalChat trata o envio nativo 15023, confirma ao emissor com 4236 e entrega ao destinatário por 4231. Os dois usuários precisam estar presentes em skyHub.members e ter sessão ativa. Não exige amizade. Portanto estar online na cidade ou visitando a casa de um amigo não basta: o privado é recusado fora do Reino do Céu.

O limite atual é 200 caracteres na janela IM, com intervalo mínimo de dois segundos compartilhado com outros envios desse serviço. O servidor autentica o remetente pela sessão e reconstrói nome/ID; não aceita remetente forjado no pacote. Não armazena IM para entrega offline nem mantém histórico central no banco.

Há ainda o privado por canal 20, limitado ao Reino do Céu e a 84 caracteres, distinto do protocolo da janela IM. O canal 8 é local ao Reino do Céu, enquanto o global 10 atende as sessões conectadas. Canal de equipe/guilda não funciona no backend atual.

O cliente tem cache e histórico próprios: IMManager.saveMsgCache alimenta imHistoryDic e chama SharedManager.saveIMHistory. Isso explica conversas antigas ainda visíveis localmente; não constitui armazenamento ou sincronização do servidor. O cliente também prevê estados de IM e resposta automática, mas 15029 é ignorado em World e não há implementação correspondente no serviço de IM. A lista de recentes é igualmente distinta da lista de amigos.

## Vínculo com Residência e sistemas internos

Fazenda/Pastagem: canVisit permite o próprio usuário ou um amigo local. As operações usam a fazenda persistente do dono, com maturação por relógio, cuidados, roubo, limites por colheita/dia e logs. Ações em fazenda alheia produzem notificações ao proprietário; outros visitantes recebem atualizações. Não é um replay da fazenda capturada.

Árvore comum: amigos podem energizar; há controle por jogador e dia, XP e limite de água. A Yggdrasil da fazenda não é a árvore matrimonial. Ter a primeira funcionando não implica implementação da segunda.

Casa/moradia: visitas exigem amizade, residência do dono desbloqueada e estado válido. O mapa da casa usa ResidenceHub com segregação pelo dono: entrada, saída, aparência, deslocamento e atualização do layout são distribuídos aos presentes naquela casa. Apenas o proprietário altera a casa ou recolhe sua produção. Amizade e formação de equipe não transferem propriedade.

O modelo enviado tem userId_a=dono e userId_b=0. Logo a casa local é individual; não há copropriedade matrimonial, produção compartilhada ou direitos de cônjuge. Os nomes dos campos do protocolo não provam que esse comportamento já está implementado.

Navegação: o upgrade de navio permite convidar amigos, com até três convites diários no fluxo atual. O auxílio exige amizade, destinatário correto, token não utilizado, prazo válido e navio em upgrade. Pode reduzir dez minutos do cooldown, com até cinco auxílios diários por ajudante e recompensa local de 40 moedas de navegação. Estes são os parâmetros atuais, parcialmente provisórios, não confirmação do balanceamento histórico online.

Presentear pela loja integrada da fazenda não está implementado: buy rejeita receive_id de outro jogador. A presença de seletor de destinatário na interface não autoriza concluir que já funciona.

## Equipes de jogadores e formação

O cliente possui FreedomTeamManager/Model e mensagens tipadas para equipe livre. O modelo mantém líder, membros, detalhes públicos, poder, estado, posições de combate e alvo de seguir. A capacidade reconhecida é quatro membros; canInviteMember verifica nível 36 para ambos no fluxo comum, com exceções contextuais entre servidores. Isso é evidência do cliente, não regra já aplicada pelo servidor local.

Pedidos do cliente: 8738 convidar; 8734 responder convite; 8736 transferir liderança; 8739 expulsar; 8740 enviar operação AFK; 8741 sair; 8737 consultar/editar posições; 8807 solicitar ingresso; 8808 responder solicitação. O cliente também possui variantes entre servidores.

Respostas esperadas: 4620 convite; 4621 AFK; 4622 criação/modelo da equipe; 4624 detalhes; 4625 dissolução; 4626 novo membro; 4627 mudança de líder; 4628 formação; 4629 saída; 4630 expulsão.

Nenhum handler para esses pedidos foi localizado em src. Não há fonte de verdade de equipes, associação jogador-equipe, sincronização dessa composição ou chat de equipe. O menu pode abrir e enviar o pedido sem completar a operação.

Não confundir com a formação pessoal de herói e tropas, tratada por SettlementFeature/8276. A formação de jogadores usa memberId/pos e 8737. O duelo entre duas contas já usa um motor compartilhado de batalha, mas isso não prova que esteja pronto o ciclo cooperativo: ainda seriam necessários montar múltiplos heróis na mesma equipe, rotear comandos pelo dono, sincronizar carregamento, tratar desconexões, resultados e recompensas.

## Casamento

MarryManager/MarryModel/MarrySender mostram um subsistema real no cliente: pedido e resposta, noivado, escolha de qualidade da cerimônia, sala/convidados, presentes, passeio, divórcio, anel e seu upgrade, felicidade, tarefas, árvore matrimonial e interação de coração. O menu abre a janela do pedido; não realiza o casamento diretamente.

O modelo identifica solteiro, noivo, casado e divorciado. O upgrade do anel consulta a tabela de upgrade tipo 36. Exemplos de protocolos: 8759 operações matrimoniais, 8760 cerimônia/convidados, 8773 árvore, 8774 tarefas, 8802 coração e 15049 compra de qualidade. Não foram encontrados handlers correspondentes no backend local.

O gate visual de proposta é nível 36 e solteiro. Não se deve inferir todas as regras de elegibilidade, custos, bônus ou requisitos de afinidade a partir apenas desse botão. Não há implementação local que una casamento, atributos, árvores e copropriedade da moradia. Não foi feita uma auditoria de disponibilidade de todos os assets de cerimônia nesta análise.

## Inconsistências e prioridades

1. Privado está desnecessariamente vinculado ao Reino do Céu. Presença do servidor e presença na cena devem ser tratadas separadamente para suportar cidade, casa e outras cenas.
2. Lista negra não existe no backend. Implementar a relação e aplicar a política de bloqueio tanto no privado por canal quanto no IM nativo.
3. Afinidade/grupos são campos fixos, embora o cliente ofereça operações reais.
4. inspectPlayer envia state=7 fixo, e a recomendação usa map_name='Cidade local'; essas informações não refletem toda a presença/localização real.
5. A visita à casa valida amizade na entrada, mas ResidenceHub.tick não revalida canVisit. Remover a amizade não expulsa automaticamente alguém que já estava na sala.
6. A fila social persiste notificações, mas IM não possui entrega offline ou histórico de servidor. São mecanismos diferentes.
7. Implementar equipe primeiro como serviço próprio usando o protocolo nativo, com convites, liderança, entrada/saída, estado, formação e canal. Integrar combate cooperativo numa etapa explícita; não dar por concluído apenas exibindo os membros.
8. Casamento requer escopo próprio; só habilitar o botão ou gravar spouseId deixaria residência, árvores, missões e benefícios inconsistentes.

## Fontes principais

- src/features/social/index.ts e inspection.ts.
- src/features/messaging/global-chat.ts; src/game.ts; src/world.ts.
- src/features/farm/index.ts; src/features/residence/feature.ts e hub.ts.
- src/features/navigation/index.ts e src/features/residence/policy.ts.
- src/features/sky-realm/index.ts e duels.ts.
- reference/campaign/evidence/current2/scripts/chat/view/ChatItemMenu.as.
- reference/campaign/evidence/current2/scripts/yishi/view/community/PlayerMenu.as.
- reference/campaign/evidence/current2/scripts/managers/IMManager.as, FriendSocketOutManager.as e FreedomTeamManager.as.
- reference/campaign/evidence/current2/scripts/managers/FreedomTeamSocketOutManager.as.
- reference/campaign/evidence/current2/scripts/mvc/module/team/FreedomTeamModel.as.
- reference/campaign/evidence/current2/scripts/managers/MarryManager.as.
- reference/campaign/evidence/current2/scripts/mvc/module/marry/MarryModel.as e MarrySender.as.

Análise por leitura de código e dos testes existentes. Não foi executada uma sessão visual de cada opção nem alterado o comportamento do jogo.
