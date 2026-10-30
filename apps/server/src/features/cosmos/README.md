# Cosmos

Estado e operações locais da janela Cosmos, sem executar combate.

- `content.ts`: catálogo e curvas recuperadas, configuração de simulação da astrologia.
- `state.ts`: instâncias próprias da conta, bolsas, estágios, pontos e posições.
- `feature.ts`: operações autoritativas e transações integradas ao mundo.
- `progression.ts`: experiência da instância e transferência por absorção.
- `attributes.ts`: operandos da fonte `cosmos` para `AttributeCalculator`.
- `protocol.ts`: adaptação dos pedidos e respostas Flash.
- `resources.ts`: resolução dos ícones preservados no backend.
- `availability.ts`: lista permitida e descrições locais; catálogo original preservado.
- `client-tables.ts`: oculta os desativados da loja e atualiza tooltips no tempinfos local.

Missões 3/623/1802 usam as definições recuperadas; astrologia e cadeado atualizam
as condições ativas. As datas originais são respeitadas: missão 623 está expirada.

Qualidades originais preservadas; qualidade 1 está temporariamente oculta; 6 é material de XP;
2/3/4/5/7 evoluem até nível 10. Décimo slot abre no nível 80, sem avanço de classe
ou missão 1802. Refinação acompanha a liberação dos oito slots comuns. Elevação e evolução
de Sagrados abrem no nível 80, sem avanço de profissão. Regras e validação
em `reports/cosmos/avancados.md`; política local em `advanced.ts`.

Somente equipados e em slots liberados contribuem. Os bônus brutos seguem por
`AttributeSource.factors`; percentuais e procs de combate, por
`AttributeSource.combatModifiers`. Cálculo único em `AttributeCalculator`;
consumo por outro sistema via `AttributeCalculator.snapshot(state)`.

O módulo não altera HP nem decide regras de dano/ativação. O adaptador de cidade
entrega `AttributeCalculator.combat` ao motor em cada nova batalha. A lista é
copiada para o ator e persistida com o combate, sem herança para tropas e sem
recalcular o equipamento durante uma luta. O executor em `features/battle`
aplica os modificadores e emite os eventos de dano/cura no protocolo nativo.

Relatório: `reports/cosmos/implementacao.md`. Saídas por template e definições:
`reports/cosmos/atributos-enviados.json`. Regeneração somente leitura de contas:
`npx tsx scripts/report-cosmos.ts`.

Política atual e contrato de probabilidades: `reports/cosmos/disponibilidade-e-efeitos.md`.
Ocultos não são sorteados/comprados, não equipam nem fornecem atributos. Exemplares
existentes são guardados em `cosmos.suspended`, com nível, XP, cadeado e posição original,
para tratamento posterior, sem ocupar posições visíveis. Reativação exige uma etapa
explícita de restauração para resolver possíveis conflitos de posições.
Cura percentual e reflexão mantêm chance de 10%, sem campo `cap`; a central calcula
`magnitude`, e o consumidor de batalha recebe `trigger` e `basis`.

Testes: `npx tsx --test test/cosmos.test.ts test/cosmos-city.test.ts`.
