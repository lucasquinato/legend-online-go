# Sistemas sociais — implementação geral

## Entrega e ambiente

Servidor em modo local (`tutorial`), HTTP em http://127.0.0.1:8080 e TCP em 5004,
com assets em `cache-first`. Contas e progresso preservados. Backup consistente:
`data/backups/social-2026-10-21T00-09-21-460Z/state.sqlite`.

Reabra completamente o launcher para receber os módulos 2 e 9 atualizados.
A validação automatizada não substitui conferir as interações completas no launcher
com dois jogadores reais; isso ainda precisa ser feito.

## Amizades, presença e residência

- Presença passa a depender da sessão autenticada no servidor, independentemente
  de campanha, casa, fazenda, cidade ou Reino do Céu. Ausente, ocupado e não
  perturbe são estados de uma pessoa conectada; desconectado é estado separado.
- Lista de amigos, inspeção e mensagens consultam essa presença. Há registro das
  últimas entradas e saídas para regras que dependam de ausência prolongada.
- Bloqueios são persistidos e impedem contato privado e novos convites. Grupos
  pessoais da lista, movimentação entre grupos e remoção foram implementados.
- A casa usa presença por proprietário, com identidade, aparência, entrada,
  saída, movimento, atualização visual e chat local sincronizados. Casas distintas
  não recebem jogadores ou chat umas das outras.
- Remover amizade **não expulsa** quem já está dentro. O visitante continua até
  sair; uma nova visita exige permissão novamente. Cônjuge casado pode visitar
  sem depender de amizade. Decoração e coleta continuam pertencendo ao dono.
- Corrigida a passagem dos pacotes sociais e de presença pela personalização das
  capturas: IDs e aparências reais dos outros jogadores não são substituídos
  pelos do personagem originalmente capturado.

## Mensagens privadas

- Janela nativa de privado funciona entre personagens, independentemente de cena
  ou amizade; remetente sempre vem da sessão autenticada.
- Conversas ficam em `social_im_history`, com remetente, destinatário, texto,
  data, indicação de resposta automática e entrega. Mensagem para desconectado
  fica pendente e é entregue no próximo login. Bloqueios são reavaliados na entrega.
- `social_im_state` guarda estado escolhido e respostas personalizadas por estado.
  Existem padrões diferentes para ausente, ocupado e não perturbe. As respostas
  e o estado são restaurados ao entrar.
- Resposta automática tem intervalo de um minuto por par e não gera respostas
  recursivas. Texto recebe limites, validação e escape de marcação.
- O registro é do servidor. Não foi criada uma nova janela para navegar todo o
  histórico antigo; a janela nativa mantém sua apresentação já existente.

## Equipes e duelos coletivos

- Equipes persistidas no servidor, sem requisito de nível. Limite de quatro
  jogadores acompanha o cliente. Convite, aceite, recusa, solicitação de entrada,
  liderança, expulsão, saída e ausência temporária têm validações no servidor.
- Formação persiste e aceita as oito posições nativas, sem posições duplicadas
  ou IDs de terceiros. Chat de equipe usa o canal nativo 6 e só chega aos membros.
- Duelos usam o mesmo motor das batalhas existentes. Convite coletivo verifica
  os líderes, registra os participantes e exige todos prontos antes de começar.
  Mudança de composição invalida o convite. Equipe fica protegida contra
  alterações durante a luta.
- Em duelo coletivo, tropas são retiradas e cada jogador controla seu herói.
  São suportados equipe contra equipe e jogador solo contra equipe. A derrota
  de um herói não encerra a partida se um companheiro ainda vive.
- Duelo individual conserva seu funcionamento próprio, incluindo tropas.
- Desconexão elimina o participante do duelo coletivo; a equipe pode continuar.
  Resultado é enviado a todos e o bloqueio de combate é liberado no encerramento.
- O ponto de convite/entrada de duelo continua sendo o Reino do Céu. Não foram
  criadas instâncias de campanha cooperativa nem matchmaking entre servidores.

## Casamento

Ciclo principal implementado sem requisito de nível:

1. Pedido consome o Anel de Casamento 208033 e aguarda aceite explícito.
2. Noivado é exclusivo e persistido; pedidos duplicados/expirados são rejeitados.
3. Casal forma equipe de dois; líder escolhe qualidade e o par confirma.
4. Cobrança usa o ledger central e ocorre uma vez. Pagamento dividido é atômico
   entre as duas contas, com restauração se uma das etapas falhar.
5. Criação e lista de salões, senha, entrada e convidados.
6. Ambos os noivos devem estar presentes e confirmar os votos. Convidados não
   podem casar o par. Festa, bolo e fogos não contam como votos.
7. Presentes da qualidade são enviados por email uma vez; anel inicial liberado.
8. Upgrade do anel usa as tabelas 36 e os materiais do cliente; felicidade usa
   a tabela 35. Seleção de habilidade valida o que o nível desbloqueou.

Qualidades recuperadas: Normal (1.199 diamantes), Nobre (3.188) e Amor de Mil
Anos (11.999). Materiais: Coração Eterno e Cristal da Eternidade para o anel;
Coração de Rosas e Selo de Juramento para felicidade. Consumo passa pela mochila;
pagamento permitido com vinculados usa primeiro esse saldo e depois diamantes.

Salões 4301, 4302 e 4303 têm presença, movimento e chat compartilhados, além de
restauração de cena. Foram recuperados e guardados **25 recursos**, incluindo
mapas, grades, construções e imagens de chão. Resultado em `wedding-assets.json`.

Atributos encontrados nas linhas de propriedades matrimoniais são entregues
brutos à central de atributos. Não se inventou bônus fixo para habilidades
ativas do anel que descrevem efeitos de combate.

### Partes ainda simplificadas

A entrega não significa fidelidade integral a todos os subsistemas matrimoniais:

- Árvore possui persistência, custos, cotas de rega, cultivo e tempo offline,
  mas seus prêmios secundários são provisórios.
- Tarefas e sintonia têm tratamento básico, limites e persistência; o ciclo
  completo de objetivos, perguntas, respostas e recompensas ainda precisa ser
  aprofundado. Consultar informações não deve conceder prêmio nem cobrar rega.
- Habilidades ativas/condicionais do anel, como cura ou ressurreição do cônjuge,
  ainda precisam de integração específica ao motor e validação em combate.
- Cortejo, automovimento e roteiro cinematográfico completo da cerimônia ainda
  precisam de conferência visual. Os salões e votos não dependem desse roteiro.
- Não foi transformada a casa em propriedade compartilhada para editar móveis.

## Compatibilidade Flash e correções preventivas

O core conserva suas 5.155 classes. Só nove métodos sociais tiveram gates de
nível removidos. O módulo 9 foi recuperado na versão correta 177f9627, com 21
métodos adaptados por uma única classe isolada `SocialMarriageBridge`.
Os modelos tipados matrimoniais já existentes no core foram reaproveitados;
classes antigas inteiras não foram transplantadas. Modas não foi alterado.

Auditoria padrão protege classes, inicializadores, assinaturas, métodos e
recursos fora do escopo. Auditor adicional confere a única classe de ponte.
O teste AIR reproduz os bloqueios antigos e verifica os caminhos liberados,
adaptação tipada e inicialização real da tela do anel.

Módulos executáveis numéricos não recebem fallback OAS de outra versão.
Assets visuais mantêm a recuperação local → remake → OAS.

## Validação executada

- Compilação TypeScript aprovada.
- 89 testes de servidor aprovados (social, Reino do Céu, residência,
  construções e navegação); os cinco testes sociais foram repetidos após os
  últimos ajustes, incluindo presença de convidados e autorização de votos.
- 22 testes de contrato SWF e fallback de assets aprovados.
- Gates AIR dos sistemas compartilhados e do casamento aprovados.
- HTTP confirmou hashes dos módulos 2 e 9, índice atualizado e servidor TCP
  escutando. Evidência em `http-validation.json`.

Prioridade para teste visual: duas contas na mesma casa; privado entre cenas;
estados e resposta personalizada; equipe e formação; duelo 2×1/2×2; proposta,
qualidade, entrada de ambos no salão, votos e upgrade do anel.
