# Atributos — contrato central

O personagem usa exclusivamente `AttributeCalculator`, em `src/attributes.ts`.
O painel capturado não é mais usado para criar diferenças de compensação.
`CityWorld` recompõe as fontes conhecidas e aplica o cálculo a cada persistência.

## Fontes brutas

- `values`: primários e atributos fixos não negativos. Força, proteção,
  inteligência, físico e liderança são convertidos pelo centro. `base_*` é a
  visão da base natural; esses campos não são somados novamente aos `total_*`.
- `percentages`: aumentos percentuais por atributo do personagem.
- `scaling`: operandos, taxas, limites e arredondamentos de efeitos exclusivos
  de uma fonte, como refinação de moda e refino espiritual de montaria.
  O centro executa também essas operações.
- `factors`: valores brutos de uma instância, multiplicador de nível e bônus
  percentual exclusivo da fonte. O centro executa a multiplicação e arredonda
  o bônus; usado por Cosmos equipados.
- `combatModifiers`: propriedades permanentes de combate com tipo semântico,
  origem, valor/percentual por nível, chance e teto. A central calcula a magnitude
  e não as mistura aos percentuais do painel. `AttributeCalculator.combat`
  fornece esses dados ao consumidor de batalha; `snapshot` fornece ambas as saídas.
- `kind`/`evidence`: identificação da origem. `unresolved` só pode existir no
  arquivo histórico da migração; fontes ativas desse tipo são recusadas.
- `derivePrimary`: marcador legado para leitura do arquivo histórico; não
  desativa a conversão no novo calculador.

Ordem: resolver efeitos exclusivos da fonte → somar primários/fixos → converter
primários uma vez → aplicar a soma dos percentuais por atributo → arredondar →
recalcular o poder de combate. O poder não pode vir de uma fonte. Valores
negativos, não finitos e multiplicadores inválidos são recusados.

## Fornecedores

| Fonte | Interface |
|---|---|
| Base por classe e nível | `naturalAttributeSource` |
| Nível, avaliação e refinação de moda | `fashionAttributeSources` |
| Coleção, adestramento e refino de montaria | `MountFeature.attributeSource` |
| Santuário | `SettlementFeature.syncAttributes` |
| Passivas da distribuição ativa | `syncSkillAttributes` |
| Seis equipamentos iniciais | `initialEquipmentSource` / `synchronizeInitialEquipment` |
| Cosmos equipados | `cosmosAttributeSource` / `CosmosFeature.synchronize` |

Fontes removíveis são substituídas/removidas por ID. Não se guarda uma fonte
negativa para retirar seu efeito. Buffs/debuffs temporários permanecem no
executor de batalha. Tropas possuem atributos próprios, não somados ao herói.

## Equipamentos iniciais

Escopo: `1011003`, `1041003`, `1012003`, `1042003`, `1013003`, `1043003`.
Cada exemplar novo recebe três famílias diferentes dentre as 12 recuperadas.
Famílias têm pesos iguais; magnitudes dentro da família também têm pesos iguais.
Força e ataque podem coexistir; duas forças ou dois ataques não podem.
O sorteio ocorre na geração, nunca ao abrir, equipar, mover ou reconectar.

O tutorial guarda os exemplares e os transfere para a cidade. Saves antigos sem
esses dados conservam os bônus anteriormente enviados pela captura. A etapa
cobre atributos básicos e bônus aleatórios; não reconstrói encantamento, gemas
ou atributos de outros equipamentos.

## Fúria

`total_initial_fury` é metadado calculado e não pertence ao pacote Flash do painel.
Leia-o em `AttributeCalculator.calculate(state).total_initial_fury`.

Uma nova batalha usa:
`min(100, max(fúriaInicialCalculada, fúriaFinalAnteriorNaMesmaInstância))`.
`CitySave.instanceFury` guarda o valor e o ID do percurso/modalidade ou campanha.
Vitória, derrota, portal e reconexão o conservam. Sair para a cidade o apaga.
Retomar uma batalha em andamento preserva sua fúria corrente; não a preenche
novamente a cada cálculo ou login.

## Migração e validação

`calculationVersion: 2` identifica as contas reconstruídas. `attributeMigration`
arquiva o painel e as fontes anteriores para auditoria. O resíduo sem origem não
participa do cálculo. Não há reset de contas, itens, níveis, modas ou missões.

`scripts/migrate-central-attributes.ts` oferece prévia e `--apply`, com backup
SQLite, preparação em cópia, verificações de preservação e transação atômica.
Encerre o servidor antes de aplicar manualmente.

Validação: `npm run check`, `npm run build`, `npm test`. Cenários novos:
`test/central-attributes.test.ts` e `test/attributes-v2-contract.test.ts`.
