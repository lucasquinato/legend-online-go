# Cosmos: disponibilidade e contrato atual de efeitos

Este relatório substitui a disponibilidade e os limites de cura/reflexão descritos na implementação inicial. O catálogo original de 82 templates permanece preservado no backend.

## Disponibilidade

- 69 definições mantidas, incluindo materiais de XP e templates avançados preservados para depois.
- Todos os Cosmos de atributos fixos permanecem autorizados; qualidade 8 agora abre no nível 80.
- Fonte de Energia e Energia da Estrela permanecem na loja por pontos.
- Mantidos: dano crítico adicional, redução percentual de dano, chance de ignorar dano, redução da chance de receber crítico, roubo de vida percentual e reflexão percentual.
- Demônio Sanguinário, Coração Corrompido, Escudo de Espinhos e Espelho de Ilusão mantêm 10% de chance, sem teto numérico de cura/reflexão. Os roxos usam 2% por nível, chegando a 20% no nível 10; os laranjas usam 5% por nível, chegando a 50% no nível 10; a chance de ativação continua em 10%.
- Ocultos são excluídos da astrologia individual/rápida/automática, da loja e das listas da conta. Compras diretas e concessões também são recusadas no servidor.
- As definições continuam no tempinfos para compatibilidade, mas StarPoint=0 retira os ocultos da enumeração da loja, que usa getStarTemplatesByPoint(0,true). Os tooltips dos quatro efeitos percentuais recebem as novas descrições apenas na resposta HTTP local; os arquivos originais ficam preservados.
- Exemplares desativados existentes são guardados em cosmos.suspended com ID, bolsa/posição original, nível, XP e cadeado. Não ocupam os slots visíveis nem contribuem ao personagem. Não são destruídos nem convertidos; uma futura reativação terá de restaurá-los explicitamente, resolvendo possíveis conflitos de posições.
- Pesos de qualidades sem resultados autorizados são descartados e os restantes renormalizados. Assim não há cobrança por uma tentativa que sorteie um Cosmo oculto. As probabilidades seguem a simulação local já identificada na implementação inicial.

## Slots e avanço de profissão

O décimo slot abre somente pelo nível 80, sem missão 1802 ou profissão avançada. O nono continua com nível 60 + missão 1802 resgatada. A regra está alinhada no servidor, na interface, ao arrastar/equipar e na seleção automática de posição. Refinação dos oito slots comuns acompanha a abertura por nível; elevação e evolução de Sagrados abrem no nível 80. Detalhes em [avancados.md](avancados.md).

## Dados recebidos pela central

Fonte persistida: `attributes.sources.cosmos`. Os atributos fixos usam `factors`, com os valores originais e o nível; a central faz a multiplicação e as conversões. Efeitos especiais usam `combatModifiers`. A saída calculada é `AttributeCalculator.snapshot(state).combatModifiers`, também disponível em `AttributeCalculator.combat(state)`.

| Chave | Significado |
|---|---|
| source | Origem: cosmos |
| kind | Identifica a propriedade entregue; lista abaixo |
| origin | instanceId, templateId, bufferId e slot para rastrear o efeito |
| level / refinement | Nível e refinação usados no cálculo; grau do slot comum equipado, entre 0 e 10; slots especiais usam zero |
| percent / value | Operandos originais por nível; o sinal negativo original é preservado |
| magnitude | Intensidade final calculada pela central, em pontos percentuais para estes efeitos |
| chance | Probabilidade em 0–100; 10 significa 10%. Cura/reflexão: 10 constante. Imunidade: calculada por nível |
| trigger | onAttack para roubo de vida; onDamageReceived para reflexão/imunidade |
| basis | damageDealt para roubo de vida; damageReceived para reflexão |
| cap | Ausente nos quatro Cosmos de cura/reflexão percentual. Ausência significa que o fornecedor não estabelece teto numérico; não é cap=0 |

## Efeitos percentuais mantidos

| Cosmo | kind | magnitude nv. 1 | magnitude nv. 10 | chance nv. 10 | trigger / basis |
|---|---|---:|---:|---|---|
| Demônio Sanguinário (1014) | lifeSteal | 2% | 20% | 10% | onAttack / damageDealt |
| Coração Corrompido (1015) | lifeSteal | 5% | 50% | 10% | onAttack / damageDealt |
| Escudo de Espinhos (1104) | reflect | 2% | 20% | 10% | onDamageReceived / damageReceived |
| Espelho de Ilusão (1105) | reflect | 5% | 50% | 10% | onDamageReceived / damageReceived |
| Magia Arcana (1204) | damageImmunityChance | 1% | 10% | 10% | onDamageReceived |
| Olho da Morte (1205) | damageImmunityChance | 2% | 20% | 20% | onDamageReceived |
| Benção Espiritual (1304) | damageReductionPercent | 2% | 20% | Não é um proc independente | Modificador permanente |
| Sopro do Dragão (1305) | damageReductionPercent | 3% | 30% | Não é um proc independente | Modificador permanente |
| Oráculo (1404) | criticalAvoidancePoints | 3% | 30% | Não é um proc independente | Modificador permanente |
| Espírito Nulo (1405) | criticalAvoidancePoints | 5% | 50% | Não é um proc independente | Modificador permanente |
| Morte Certa (1604) | criticalDamageBonusPercent | 3% | 30% | Não é um proc independente | Modificador permanente |
| Luz da Sentença (1605) | criticalDamageBonusPercent | 5% | 50% | Não é um proc independente | Modificador permanente |

criticalAvoidancePoints é a redução em pontos percentuais da chance de receber crítico: percent negativo no operando e magnitude positiva de redução. Não é uma chance própria de ativação. damageReductionPercent e criticalDamageBonusPercent também são modificadores permanentes, sem um sorteio adicional.

A central não limita a 100% a intensidade de cura/reflexão. O intervalo 0–100 se aplica a probabilidades. A vida máxima e a execução dos efeitos continuam sendo responsabilidades do consumidor de batalha.

## Exemplos da saída calculada (nível 10)

```json
[
  {
    "kind": "lifeSteal",
    "origin": {
      "instanceId": 1,
      "templateId": 1015,
      "bufferId": 80702,
      "slot": 0
    },
    "level": 10,
    "refinement": 0,
    "value": 0,
    "percent": 5,
    "chance": 10,
    "trigger": "onAttack",
    "basis": "damageDealt",
    "source": "cosmos",
    "magnitude": 50
  },
  {
    "kind": "reflect",
    "origin": {
      "instanceId": 1,
      "templateId": 1105,
      "bufferId": 80902,
      "slot": 0
    },
    "level": 10,
    "refinement": 0,
    "value": 0,
    "percent": 5,
    "chance": 10,
    "trigger": "onDamageReceived",
    "basis": "damageReceived",
    "source": "cosmos",
    "magnitude": 50
  },
  {
    "kind": "damageImmunityChance",
    "origin": {
      "instanceId": 1,
      "templateId": 1205,
      "bufferId": 81002,
      "slot": 0
    },
    "level": 10,
    "refinement": 0,
    "value": 0,
    "percent": 2,
    "trigger": "onDamageReceived",
    "source": "cosmos",
    "magnitude": 20,
    "chance": 20
  },
  {
    "kind": "criticalAvoidancePoints",
    "origin": {
      "instanceId": 1,
      "templateId": 1405,
      "bufferId": 81302,
      "slot": 0
    },
    "level": 10,
    "refinement": 0,
    "value": 0,
    "percent": -5,
    "source": "cosmos",
    "magnitude": 50
  }
]
```

## Ocultos temporariamente

| ID | Cosmo |
|---:|---|
| 1 | Perdição |
| 2 | Profecia |
| 3 | Nulidade |
| 804 | Benção Divina |
| 805 | Espírito de Shura |
| 904 | Deteminação de Destruição |
| 905 | Espírito do Deus Ares |
| 1003 | Benção |
| 1004 | Determinação Indomável |
| 1005 | Toque da Deusa |
| 1313 | Espírito Santo |
| 1314 | Proteção de Pedra |
| 1315 | Luz da Gaia |

Foram ocultados também os três resultados sem bônus. Os Cosmos de redução fixa de dano foram tratados como efeitos especiais, não como atributos fixos do painel, e ficaram ocultos conforme a seleção de efeitos percentuais. O material de XP permanece disponível.

## Responsabilidades e validação

Nenhuma regra de dano, turno, cura, HP ou reflexão foi implementada dentro do módulo de Cosmos. O módulo fornece os operandos à central; a central entrega as propriedades calculadas. O executor de batalha permanece responsável por consumir esses dados, escolher a ordem de aplicação e resolver os eventos.

Testes em data/cosmos-availability-tests.log: whitelist, impedimento de compra/sorteio, preservação de exemplares suspensos, ausência de cap, magnitude/chance/trigger/basis, persistência e comparação byte a byte das tabelas não relacionadas. Esta atualização também altera apenas os três métodos de Cosmos autorizados nos módulos 2/5, com auditoria de bytecode e prova nativa no AIR; nenhum formatter foi executado.

## Resultado verificado

12/12 testes específicos passaram. A suíte geral teve 488/492 aprovados, com 4 falhas também reproduzidas na cópia do código anterior à alteração de Cosmos. A lista e os logs estão em verificacao-disponibilidade.json.

A resposta HTTP real de /xml/tempinfos.xml foi verificada após a ativação do build: 82 definições preservadas, 13 ocultos com StarPoint=0 e quatro descrições de cura/reflexão sem teto. Servidor local ativo; reabrir o launcher recarrega os dados. A aparência final no AIR ainda depende do teste visual no jogo.
