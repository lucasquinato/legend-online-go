# Runas de Habilidades

O módulo usa os 132 registros de RuneTempInfos (dez famílias, incluindo as quatro progressões avançadas), seus SkillTemplateId e buffers. A extração reproduzível `node scripts/import-runes.mjs` lê somente o pacote original preservado no backend. Não usa a pasta do cliente. Runas de combate desta aba não são o sistema separado de pedras, gemas e furos rúnicos.

## Ciclo implementado

- Liberação no nível 35 e segundo atalho no 40, conforme configurações e tela atual.
- Aprendizado com o item correto na posição da mochila, validando quantidade, família, classe e nível. Não há novas runas aprendidas automaticamente.
- Oito slots temporários para absorção, ligados ao movimento comum da mochila. Apenas materiais SonType 302 podem entrar. Arraste e duplo clique transferem a pilha inteira, embora o cliente envie count=1; a devolução dos materiais não usados também transfere toda a pilha. A divisão comum entre slots da mochila permanece independente. Há deltas de inventário inclusive para restaurar visualmente uma operação rejeitada.
- Experiência de Property2, integral para material compatível/universal e um décimo para outra família. O material Property1=100 fornece 50 na versão básica e 10 na avançada, conforme RuneUpgradeView atual.
- Evolução sequencial por NextRuneId e NeedGp. Runas básicas mantêm NeedGrade como requisito do personagem. Por regra local solicitada, promoção e evolução avançada liberam no nível comum 80, substituindo os requisitos de profissão avançada apenas nas runas. A barra básica pode ficar cheia aguardando seu requisito. Materiais não necessários permanecem no slot. Não são criados IDs ausentes: as referências 410→411 e 510→511 não habilitam promoções inexistentes.
- Promoção exige nível 80, fim da progressão atual, tabela avançada e dez unidades do item 3021001. A implementação inicia a progressão avançada pelo primeiro registro; o cliente mostra o máximo avançado no preview, mas não entrega a fórmula do servidor original de conversão de XP. Esse ponto exige captura específica para equivalência exata com o online.
- Equipar, trocar e desequipar: dois slots, sem repetir família, sem custos. Atalhos acompanham automaticamente upgrades e promoções.
- Consumo diário por runa, com reset pela data de São Paulo, inclusive após ficar offline. O limite configurado é 999999 unidades por dia. Não há recarga ou consumo de moeda inventado.

O estado vive em CitySave.runes. Progresso, inventário e save participam da mesma transação de CityWorld. Falha na gravação reverte materiais e XP; operações durante batalha e alterações em personagem alheio são recusadas. A reconexão publica o modelo atual e não reaplica pacotes de runas capturados de outra conta. Nenhum personagem é resetado ou recebe itens automaticamente nesta etapa.

Não se altera `vocationGrades`, profissão ou o estado de outros sistemas para liberar as runas. O módulo 5 atual recebe somente três ajustes de gate: clique de promoção, disponibilidade de evolução avançada e aviso de barra cheia no upgrade. Abaixo de 80 não há promoção; no 80 a evolução avançada usa os registros e custos existentes até o fim real da tabela. O teste AIR executa os métodos candidatos com dependências de interface simuladas em cópias separadas, nunca publicadas.

## Compra pela interface

`shop.ts` usa apenas ofertas ShopType=1 originais de materiais SonType=302. Inclui as dez famílias e pedras 3020010/3021001, com seus preços originais (ofertas 400–411 e ofertas adicionais preservadas). Não transforma ofertas de arena/evento em compras gratuitas nem inventa preços.

Compra comum 5154 usa pay_type 0/1; a compra rápida atual envia carrinho 8970 com payType 1/2. Diamantes são usados com opção 1; a opção de vinculados usa saldo vinculado primeiro e complementa com diamantes. O ledger central registra o débito e o inventário concede os itens na mesma transação do save. Compras para terceiros, ofertas estranhas, quantidades inválidas, cupons não suportados e pagamento insuficiente são recusados sem consumo parcial.

O cliente BuyFrameI compra por 8970 mas aguarda resposta 90 para continuar o aprendizado/promoção. O servidor envia o delta 115 antes da confirmação 90 e também responde 4783 ao carrinho, evitando que o callback consulte uma mochila desatualizada. Não envia o bootstrap inteiro nem reaplica dados capturados.

Protocolo extraído do core atual: requisição 8605, resposta 4495, HeroRuneOpMsg; operações 1 aprender, 2 absorver/evoluir, 3 atalhos e 4 promover. Os modelos 113/150 carregam HeroRuneMsg. O core atual foi decompilado em reports/runas/evidence/current2 para não confundir a assinatura antiga de upgrade com a atual, que envia apenas o ID e usa os itens da bolsa temporária.

## Contrato com a batalha

`runeBattleContract(state)` entrega um snapshot independente com ID e tipo da runa, slot, habilidade completa, buffs, quantidade máxima de usos, cooldown próprio/de abertura e cooldown comum de 20000 ms. Somente runas efetivamente aprendidas e equipadas são incluídas.

O adaptador de batalha inclui os IDs em Hero.skillId e entrega esse snapshot em AdventureBattle.runes e Actor.runes. O motor mantém a responsabilidade por autorizar/executar o uso, decrementar contadores, controlar cooldown, aplicar/remover buffs e resolver seus efeitos. Esta implementação não cria um segundo executor, não aplica os buffs antecipadamente nem converte seus efeitos em atributos permanentes do personagem. A integração do limite/cooldown à política executora deve usar os dados do contrato, não copiar regras da interface.

Integração do executor concluída em 16/10/2026: limite por batalha, cooldowns
próprio/inicial/comum e consumo de ação entram na política do motor. Stun ou
morte antes da execução não consomem usos/recargas. Preparo nativo inclui
Hero.item; seleção aceita 10499/BattleItemMsg e responde 158/ItemUseResultMsg.
O contador é atualizado na execução e preservado ao reconectar. Os efeitos
permanecem no mesmo executor e no protocolo de buffers já usado pelas skills.

Runa ofensiva usa o maior valor entre ataque físico e mágico (sem somar), com
a defesa correspondente. Fúria aplica percentual e parcela fixa; Restauração
cura imediatamente por HP máximo. Sangramento usa percentual do HP máximo
antes das ações, limitado a 8.000 por ação nos níveis normais e 20.000 nos avançados, mesmo após a morte de quem aplicou. As descrições
locais das tabelas de runa, skill e buffer foram atualizadas; originais preservados.

Confusão redireciona ações ofensivas para aliados vivos, excluindo o próprio
ator. Sem outro aliado, ataca inimigos. Curas/buffs passam a visar inimigos,
inclusive runas. Uma confusão aplicada após selecionar a habilidade atualiza
a reserva ao executar. Oblívio sorteia habilidades ativas aprendidas e runas
equipadas, sem reposição; não bloqueia passivas nem o ataque básico e não cria
cooldown nas habilidades bloqueadas. A imunidade segue RejectType dos inimigos.
Desaceleração tem debuff, duração e remoção, sem modificar ordem/frequência da
fila, conforme adiamento explícito do usuário. Liderança e IA das tropas não
foram modificadas.

## Verificação

`test/runes.test.ts` cobre as três profissões, dez famílias, slots, XP, promoção, persistência, rollback, fraude de identidade, bloqueio durante combate e contrato de batalha real. Os testes do motor e da cidade continuam sendo executados separadamente. A suíte geral encontrou também três expectativas antigas de forja que já consideram funções atualmente implementadas como indisponíveis; elas não foram reescritas para ocultar essa divergência nesta etapa.

Validação em 16/10/2026: compilação TypeScript concluída; 80 testes focados aprovados (runas, habilidades, construções/fazenda, armazenamento e recurso do core); os oito testes de runas foram repetidos e aprovados após alinhar o requisito avançado; sete testes de contrato SWF aprovados. O build do core passou auditoria e probes AIR, incluindo carregamento real do preview de formação. O usuário confirmou visualmente previews e quatro formações funcionando. O servidor permaneceu local, sem reset de contas.

Na integração posterior de compras/liberação no 80: compilação aprovada; 53 testes focados aprovados, incluindo compra das dez famílias e duas pedras, sequência 115→90, aprendizado, relog, pagamentos, fraude, falha de save e rollback. Mais um teste de mochila cheia foi adicionado e a suíte de três testes de loja foi repetida/aprovada. Sete testes SWF aprovados; auditoria mantém 407 classes, nenhum ABC vazio, tags protegidos idênticos e nove métodos permitidos no módulo 5. O candidato passou os testes AIR das runas e de pesquisa de títulos; os respectivos baselines falharam como esperado. Backup SQLite anterior ao reinício em data/backups/before-rune-purchases-2026-10-16T18-43-23.525Z.
