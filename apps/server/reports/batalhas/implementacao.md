# Implementação do motor de batalha

Implementação das regras confirmadas pelo usuário em `src/features/battle`. O arquivo `src/adventure-combat.ts` mantém a API antiga por reexport, preservando a integração dos modos de jogo.

## Comportamento

- Fórmulas confirmadas de dano físico/mágico, crítico, bloqueio e penetração; parcela fixa antes dos multiplicadores.
- Bônus das ativas do arqueiro somados em pontos percentuais somente naquela habilidade.
- Alvos automáticos reservados na seleção, substituição de mortos pela mesma regra e exceção da segunda Rajada Dupla.
- Executor de uma ação por vez; espera por frames de animação em lugar de uma rodada inteira calculada antecipadamente.
- Sangramento/veneno antes da ação, com cancelamento sem fúria/cooldown se o ator morrer.
- Buffs renovados/acumulados por ações do beneficiário, respeitando limites e sem beneficiar a ação que os criou.
- Modificadores somados dentro de cada categoria; vulnerabilidade também beneficia tropas.
- Cura por magia do conjurador, escudo por HP máximo, reflexão e roubo de vida antes de crítico/bloqueio.
- Dispel, efeitos de controle, desconto de custo e passivas após ação/dano/crítico/bloqueio.
- Reflexão limitada a dez ativações por batalha, com aviso nativo de habilidade indisponível ao cliente.
- Listas próprias de habilidades de NPCs e estado serializável para reconexão.

## Tutorial

Os três encontros, incluindo a conquista da cidade, permanecem ensaiados e impossíveis de perder. O executor comum recebe a política de dano e HP do roteiro; invocações, pausas, ordem narrativa e callbacks são mantidos no adaptador. A sequência original da maga foi comparada com a captura, e seis identidades de personagem foram exercitadas com escolhas diferentes e HP crítico.

Campanha e labirinto usam o combate livre. Não há proteção de HP do tutorial nesses modos. Recompensas, missões, pedestais, cartas e portais continuam nos módulos existentes, consumindo o resultado da batalha.

## Protocolo e preservação

HP máximo não é enviado como `DamageMsg.hp_limit`: esse campo representa uma alteração de HP máximo no cliente. Contadores curRound/maxRound foram incluídos nos buffs, evitando remoção visual imediata. Pacotes de tropas respeitam seu schema próprio. Ações/resultados têm escopo de battleId para evitar envio de uma batalha substituída.

Batalhas antigas recebem migração transitória do motor, sem reset de contas, equipamentos ou evolução. Fontes permanentes de atributos e o módulo de modas não foram modificados por esta implementação. O backup anterior está indicado em `data/battle-engine-backup.txt`.

## Verificação

- `test/battle-engine.test.ts`: contratos de cálculo, alvos, fila/custos, buffs, passivas, controle e serialização.
- Testes existentes de tutorial, cidade, tropas, habilidades, campanhas e labirinto.
- Suíte completa: resultado final e dados do serviço em `data/battle-engine-deployment.json`.
- Logs: `data/battle-engine-core-test.log`, `battle-engine-regression-test.log` e `battle-engine-full-test-final.log`.

Dois testes que esperavam uma rodada inteira por tick foram adaptados para o novo contrato por ação. Um teste de moedas com contagem fixa foi ajustado para o catálogo atual, que recebeu outra moeda por uma alteração paralela.

## Limites práticos

O teste automático não é uma inspeção visual do Flash. A duração usa os metadados recuperados das ações, sem um novo comando do cliente confirmando fim de animação. IA básica e os mecanismos das habilidades iniciais estão implementados; condições ocultas de IA avançada, invocações/mudanças de forma fora do roteiro e árvores/talentos/runas ainda não liberados não são declarados concluídos nesta etapa.

Para os efeitos ainda não especificados pelo usuário: cura/escudo usam arredondamento ao inteiro mais próximo; dano periódico preserva o cálculo da aplicação; os sorteios de crítico/bloqueio são independentes; a quantidade de Destruição Estrelar é sorteada uniformemente dentro do intervalo confirmado. Essas escolhas estão isoladas no motor para ajuste posterior.

Não foi executado formatter.
