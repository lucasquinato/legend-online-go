# Motor de batalha

Este módulo executa o combate livre da campanha e do labirinto e é reutilizado pelo tutorial com uma política de dano/proteção ensaiada. A conquista da cidade permanece no roteiro protegido. Não altera as fontes permanentes de atributos, o módulo de modas ou os saldos/recompensas de outras features.

## Estrutura

- `content.ts`: tabelas preservadas no backend, descrições locais atuais, skills/buffers/ações/IA e frames de animação. Nenhuma leitura da pasta do cliente.
- `special-attributes.ts`: funções puras de crítico/bloqueio/penetração, coeficientes nomeados e normalização numérica.
- `mechanics.ts`: dano/HP, wrappers de compatibilidade e reexport das fórmulas especiais. O tutorial compartilha esse código com limites de HP definidos pela política.
- `engine.ts`: atores, escolha automática de alvos, reserva/fila, IA, efeitos persistentes, custos/cooldown e executor de ações. Estado e RNG são serializáveis.
- `initiative.ts`: carga individual de 1.000 pontos/s até 3.000, custos por categoria, reservas ordenadas por prontidão, pausa e retomada sem carga offline.
- `pressure.ts`: aumento global de dano final em 50 pontos percentuais a cada minuto ativo, relógio persistido e integração com o contador nativo pelo pacote 4361.
- `adventure.ts`: adaptação para preparo/ordens/resultado do protocolo existente, identidade/aparência/tropas e migração transitória de batalhas anteriores.
- `timing.ts`: abertura narrativa do tutorial; duração recuperada de vitória/derrota e margem de envio do resultado.
- `tactical-ai.ts`: avaliação de habilidades equipadas/runas por simulações isoladas do executor; prioridades por classe e registro da decisão.
- `automatic.ts`: controle individual de automático e confirmação pelo protocolo 10020/77.
- `../../adventure-combat.ts`: reexport para preservar imports e referências de campanha/labirinto.
- `../../combat.ts`: adaptador de roteiro. Os slots narrativos e as ações de NPCs preservam o tutorial, enquanto as ações do jogador usam o executor comum com dano ensaiado e proteção de HP. Invocações/pausas narrativas continuam no adaptador.

## Regras

Cada seleção reserva automaticamente alvos e posição na fila. O jogador não seleciona um alvo manualmente. Uma escolha manual pendente não é substituída por cliques adicionais. NPCs/tropas utilizam decisões automáticas; o jogador sem uma ordem pendente mantém o ataque básico automático.

Com o automático ligado, o jogador usa a IA tática própria, com custo/recarga,
barra equipada, runas e estado real de HP/efeitos. Cada participante de um duelo
controla seu próprio modo; seleção manual válida o desativa. A IA compartilha o
executor em cópias isoladas, sem consultar o RNG real. Especificação e limites em
`reports/batalhas/ia-tatica.md`.

O executor resolve uma ação por vez. O adaptador espera a duração em frames da ação (25 fps) antes da próxima ação, sem o antigo intervalo universal de 700 ms ou lote de rodada pré-calculado. O cliente continua organizando suas animações; não há confirmação nova de término de animação nem modificação do cliente. O último resultado é produzido após a duração da última ação, mantendo o fluxo existente de resultados, cartas, portais, missões e recompensas.

No combate livre, a carga começa no callback de carregamento: runas custam 400; ataque padrão, habilidades comuns, curas e escudos custam 2.300; especiais EX (Priority=3) custam 3.000. A categoria vale para todos os níveis da família. A primeira ação também precisa carregar. Uma reserva manual aceita permanece até a execução; o ataque automático só pode ser substituído antes de ficar pronto. A fila prioriza o instante em que a ação ficou pronta, com desempate pela ordem de confirmação. Uma runa nova não ultrapassa uma ação que já estava pronta.

Apenas quem executa zera a carga e volta a carregar ao terminar sua animação. Os demais continuam acumulando até 3.000, inclusive em grupos e duelos, sem bônus ou reset coletivo. Selecionar durante a animação reserva a próxima ação. Fúria, recarga e usos continuam sendo consumidos na execução; stun e sangramento fatal anulam a ação conforme as regras existentes. A IA considera também o custo de iniciativa ao avaliar as habilidades.

O tutorial e a conquista da cidade conservam os slots narrativos, danos ensaiados e proteção. As ações do jogador usam a carga individual dentro desses slots; a abertura narrativa continua limitada por três segundos ou seleção válida. Callback duplicado não reinicia a carga nem encurta animações. Pausa e reconexão preservam reservas, deslocando os prazos pelo tempo suspenso, sem ganhar iniciativa offline.

O protocolo nativo informa o tempo restante da reserva em `HeroOrderMsg.cast_time` e mantém os callbacks de aceitação/rejeição. O servidor não adiciona uma barra nova ao SWF. O relógio de frames acompanha esperas entre ações para evitar o envio de execuções com frames antigos. Logs `battle-initiative` registram reservas, rejeições e execuções com battleId.

No combate livre, cada minuto ativo soma 50% ao multiplicador global de dano final: 1×, 1,5×, 2×, 2,5× e assim por diante, sem teto de etapas. O contador começa no carregamento concluído, inclui as animações e congela em pausas/reconexões. A camada alcança ataques, tropas, procs e danos periódicos depois dos cálculos individuais. Escudos absorvem o dano já ampliado; imunidade continua reduzindo a 1. Reflexão e roubo de vida usam a base final ampliada, sem aplicar o fator global novamente. Curas e o roteiro protegido não são ampliados. O aviso 4361 envia incrementos, pois HurtUpMode soma damage_improve; o preparo de reconexão envia o total atual. Detalhes e referências originais em `reports/batalhas/escalada-dano-tempo.md`.

O encerramento preserva os 20 frames das ações SuccessSkill/FailedSkill recuperadas (800 ms), acrescenta 200 ms de margem e envia os demais pacotes na mesma ordem em intervalos de 5 ms. Os antigos atrasos de 5,5–6,2 segundos deixaram de bloquear o retorno. No tutorial, essa espera começa no momento agendado da animação final, mantendo os frames narrativos.

Alvos: aleatório, próprio, todos, menor percentual de HP, frente/fundo conforme formação, grupos frontais/traseiros, coluna aleatória, prioridade no herói e quantidade de alvos de Destruição Estrelar. Reservas mortas são substituídas antes da ativação. Rajada Dupla admite alvo repetido e não redireciona o segundo ataque após morte pelo primeiro. Ataques lógicos e impactos de animação são distintos.

Dano base: `A²/(A+K×D) × coeficiente + fixo`, com `K(D)=5+2×D³/(D³+1.500.000³)` em `mechanics.ts`, preservando físico, mágico e adaptativo. K atua somente no denominador, sem alterar atributos, cura ou escudos. Os parâmetros únicos são `DEFENSE_K_MIN=5`, `DEFENSE_K_ADDITIONAL=2`, `DEFENSE_K_REFERENCE=1_500_000` e `DEFENSE_K_EXPONENT=3`. `defenseEffectiveness(D)` normaliza a razão cúbica; a normalização do dano pelo maior atributo evita overflow intermediário sem arredondar o dano base. O antigo export `DEFENSE_EFFECTIVENESS` conserva apenas o mínimo por compatibilidade e não participa do cálculo dinâmico. O fixo precede os multiplicadores. Crítico, bloqueio e penetração são resolvidos exclusivamente em `special-attributes.ts`: referência crítica `375 × nível do atacante`, referência de bloqueio `187,5 × nível do defensor`, resistência natural, redução crítica posterior à chance básica, excedentes e curva própria da penetração. O bloqueio tem chance básica máxima de 50% e redução de dano de 40% a 60%; penetração retira até 20 p.p. da chance e soma dano crítico sem teto global de 200%. Bônus das ativas do arqueiro permanecem exclusivos da habilidade. As duas curas críticas do mago usam o multiplicador completo do conjurador; as demais continuam sem crítico. A implementação e os resultados de referência estão em `reports/batalhas/reformulacao-atributos-especiais.md`. O histórico do coeficiente fixo está em `reports/batalhas/rebalanceamento-ataque-defesa.md`; a curva dinâmica com mínimo 5 e assíntota 7 está em `reports/batalhas/defesa-dinamica-faixa-5-7.md` (histórico de 18 em `reports/batalhas/defesa-dinamica.md`).

Sangramento/veneno executam antes da ação do afetado; morte cancela sem custo. Custos e cooldown começam na ativação. Efeitos novos não amplificam a própria ação nem gastam sua duração nela. Contadores avançam por ação do beneficiário; reaplicação renova e, quando acumulável, adiciona camada até o máximo, com duração comum. Sangramento preserva o valor ofensivo calculado na aplicação. Alterações de atributos permanentes continuam responsabilidade do setor de atributos.

Executor: cura, dano periódico, reserva de escudo, reflexão, roubo de vida, redução/amplificação, dissipação, controle, desconto de custo, fúria e passivas após ação/dano/crítico/bloqueio. Ganhos por crítico são disparados por impacto crítico, respeitando o limite de camadas. Bônus gerados durante a ação só beneficiam ações futuras. Reflexão tem dez ativações por batalha; a décima comunica bloqueio específico da habilidade pelo protocolo nativo, sem impedir as outras habilidades.

As ações ensaiadas usam a política de roteiro e não sorteiam crítico/bloqueio nem recalculam os danos narrativos pela fórmula livre. Isso preserva a dinâmica original e a impossibilidade de derrota até a conquista da cidade.

## Persistência e integração

O save da batalha contém atores, HP/fúria/cooldown, usos, buffs/camadas/duração, fila/alvos e semente do RNG. A reconexão repõe o preparo com os efeitos atuais. Uma batalha antiga sem motor recebe uma migração transitória usando o estado atual da conta e preservando HP, cooldown e identificador; não há reset de contas.

Pacotes essenciais têm escopo por battleId; timers não podem enviar ações/resultados de uma batalha substituída. Buffs incluem os campos recuperados curRound/maxRound e targetSkillId quando necessário. `DamageMsg.hp_limit` é uma mudança no HP máximo, portanto não é enviado em impactos comuns. Tropas usam seu próprio schema sem campos exclusivos de heróis.

Um turno perdido por stun emite ordem 0 (`EmptyActionSkill`), duração de um frame e os eventos de expiração. Uma seleção manual cancelada recebe callback de rejeição para limpar a reserva do cliente. O ID da habilidade reservada não é enviado como execução: isso impediria o uso no servidor, mas ainda iniciaria a animação/cooldown visual no Flash. Não há gasto de fúria, registro de uso ou novo cooldown.

Cura mantém separados o valor aplicado e o valor exibido. `damage_value` contém o valor negativo completo da cura, enquanto `left_value` contém o HP final limitado ao máximo. O leitor de sangue do cliente preserva esse número para exibição e limita a alteração efetiva de HP. A regra também atende cura periódica/por efeito, roubo de vida e o adaptador do tutorial.

## Alcance e limites

Dispersão/Purificação: cada `Effect` persiste a propriedade `removable`.
`effect-removal.ts` reúne a política: temporários com Dispel=0 são removíveis,
exceto descrição explícita de proteção; permanentes e bloqueios internos de
uso não são removíveis. O cliente original confirma Dispel!=0 como noDispel.
Saves antigos recebem a propriedade sem sobrescrever uma decisão já salva.
Entre os efeitos elegíveis do sinal correto, remoções parciais usam sorteio
uniforme sem reposição; camadas não aumentam o peso. Protegidos não consomem a
cota. A remoção usa o evento nativo see_type=2 e não altera o SWF.

Alinhamento de skills em 16/10/2026: Reflexão de Ataque e roubo de vida de
Disparo Sanguinário usam a mesma lista de impactos finais dos cosmos. Todas as
reflexões antecedem qualquer cura, exigem portador vivo e não disparam efeitos
em cadeia. A cura exige atacante vivo. A base inclui crítico/bloqueio, dano
absorvido por escudos e excesso sobre a vida restante. Meteorito usa magia e
resistência mágica no seu proc adicional; o proc físico de Ataque Furacão segue
físico. Liderança, IA de tropas, atributos reservados e regras de dispersão não
foram alterados nesta correção.

Cosmos: atributos fixos chegam pelos totais centrais; modificadores permanentes
chegam por `AttributeCalculator.combat` e são copiados para o ator ao iniciar a
batalha. A reconexão preserva esse snapshot. `permanent-modifiers.ts` aplica a
camada permanente: crítico de 150% + bônus de 50% = 200%, bloqueio, redução e
demais operandos. A camada temporária soma aumento causado + aumento recebido
(inclusive reduções negativas) em um único fator posterior. Imunidade sorteada
por impacto transforma o dano em 1 sem remover debuffs. Após todos os impactos,
reflexões são processadas antes das curas, usando o dano absoluto final antes
de escudos e do limite de HP restante. Mortos não refletem nem recuperam vida;
reflexão não ativa outros efeitos. Cada impacto tem seu próprio sorteio. O
tutorial ensaiado ignora esses procs para preservar o roteiro.

Os contratos das 45 famílias iniciais e das dez famílias de runas são interpretados. Runas usam maior ataque para dano, limites e recargas do snapshot, efeitos de confusão/Oblívio, sangramento percentual sem teto e cura imediata. Desaceleração é somente um debuff visível, sem efeito na fila. IA básica utiliza listas próprias de habilidades, disponibilidade, fúria e cooldown, com condições locais para habilidades reativas. Não é uma recuperação integral das condições ocultas dos 8.080 registros de IA original. Invocações e mudanças de forma fora do roteiro, árvores avançadas/reformuladas, talentos e outras operações ainda não liberadas não são declaradas concluídas por este módulo.

Os cálculos são as regras locais confirmadas pelo usuário. A duração usa metadados das animações; compatibilidade visual, atrasos reais do Flash e balanceamento devem ser verificados no teste do launcher. Os testes automáticos comprovam contratos, serialização e integração, não uma inspeção visual de cada animação.

## Validação

`test/battle-engine.test.ts` cobre fórmulas, fila/custo, retarget, Rajada Dupla, sangramento fatal, renovação/expiração, soma, escudo/cura, reflexão/roubo, passivas em área, controle e protocolo. Os testes existentes de tutorial, campanha, cidade, habilidades, tropas, labirinto e modas permanecem como regressão. Não executar formatter.
