> Histórico da implementação inicial. A política atual de disponibilidade, cura/reflexão sem teto e o contrato atualizado estão em [disponibilidade-e-efeitos.md](disponibilidade-e-efeitos.md). As referências a limites e famílias disponíveis no texto histórico abaixo foram substituídas por essa atualização.

# Implementação dos Cosmos e contrato de atributos

## Resultado e escopo

Módulo autoritativo em `src/features/cosmos`. Apenas instâncias equipadas na bolsa 2 e em slots liberados fornecem contribuições. Mochila e resultados temporários não concedem atributos. As operações substituem integralmente `attributes.sources.cosmos`, evitando acúmulo ao relogar ou reequipar.

O módulo entrega operandos à central: valores do template, nível e metadados dos efeitos. `AttributeCalculator` faz multiplicações, conversões e produz os valores finais. `AttributeCalculator.snapshot(state)` expõe atributos e modificadores; `AttributeCalculator.combat(state)` expõe somente os modificadores permanentes com a origem de cada um. Nenhum efeito especial é enviado como atributo desconhecido no pacote Flash do painel.

**A execução dos modificadores especiais em batalha não foi implementada nesta tarefa.** A central já os fornece; a batalha precisa consumir esse contrato para sortear imunidade, aplicar redução, refletir ou curar. Não há conversão artificial desses efeitos em ataque/defesa, nem implementação de combate dentro dos Cosmos.

## Mecânicas implementadas

- Estado individual por conta, IDs próprios, posição, bolsa, qualidade, nível, XP residual e cadeado.
- Astrologia nos cinco estágios, tentativa inicial gratuita, custos 4.000/5.000/6.000/8.000/10.000 de ouro pelo ledger central e 1/2/3/4/5 pontos. Não se inventou reposição diária da tentativa gratuita.
- Piso de 20.000 de ouro na astrologia individual paga, conforme interface; cobrança efetiva segue a bola escolhida.
- Até 18 resultados temporários; recolher individualmente ou todos os resultados úteis; vender individualmente ou por qualidade, usando SellGold.
- Mochila de Cosmos com 12 posições; compra de mais seis por 100 diamantes, com pagamento vinculado conforme opção do cliente; limite visível de 18.
- Equipar, retirar e trocar posições; validação de nível, classe, slot e exclusividade por família MasterType. Cosmos compostos 17/18/19 exigem slot avançado.
- Absorção manual, inclusive para evoluir um Cosmo equipado; absorção em lote nas bolsas temporária e de Cosmos; preservação de cadeados. Material de XP não equipa. Lote na mochila não consome Cosmos de nível 10, seguindo o filtro da janela.
- Curvas completas das qualidades 2, 3, 4, 5 e 7 até o nível 10; materiais de qualidade 6 entregam 500/2.500 XP por instância. A experiência transferível recupera SellGp + XP residual + custos das etapas adquiridas. Excedentes permanecem na instância para evitar perda silenciosa.
- Loja por pontos, incluindo materiais em quantidade: a janela envia várias compras individuais, cada uma autoritativa e validada por saldo/capacidade.
- Astrologia rápida: nível 60 ou VIP 1 ativo; automática: nível 80 ou VIP 2 ativo, conforme módulo 5 mais recente e configuração astrology_free_function_level=60,80. O relatório de análise anterior citava requisitos da versão antiga e fica corrigido por este documento.
- Automático usa orçamento de 100 mil/1 milhão/10 milhões, filtros de venda/absorção e para por orçamento, saldo ou espaço. Débitos são por tentativa realizada. A tentativa rápida realiza uma tentativa no maior estágio aberto: comportamento local sem captura original do pedido -1 para calibrar um eventual lote.
- VIP não é concedido pelos Cosmos: só considera entitlement local explícito `saved.vip` com level/expiresAt; pacotes VIP de outra conta capturada não autorizam o recurso. Sem um módulo VIP local, o acesso comum funciona pelos níveis 60/80.
- Rejeição de alterações durante batalha em andamento; rollback atômico de saldo, instâncias, fonte e persistência se uma operação falha.
- Protocolos 8267/8268/8269/8270/8325/8330/8331/8341/8876; respostas 4178/4179/4180/4261/4479/4677 e modelos do personagem. Login elimina os snapshots de Cosmos herdados da captura e envia apenas o estado local.
- `/starlist` autenticado e compactado, para consultar exclusivamente instâncias da conta.

## Atributos fixos enviados à central

Os dados são fornecidos em `factors`: valor bruto do template e fator nível. A central faz a multiplicação e aplica a conversão dos primários uma vez. Bônus de equipamento usam `total_*`, não alteram a base natural `base_*`.

| Campo recuperado | Campo central | Definição | Templates com valor não zero |
|---|---|---|---:|
| Power | total_power | Força: +4 ataque físico e +1 defesa física por ponto | 0 |
| Agility | total_agility | Proteção: +4 defesa física e +4 defesa mágica por ponto | 0 |
| Intellect | total_intellect | Inteligência: +4 ataque mágico e +1 defesa mágica por ponto | 0 |
| Physique | total_physique | Físico: +20 de vida por ponto | 0 |
| Captain | total_captain | Liderança: +1 de infantaria por ponto | 4 |
| Attack | total_phy_attack | Ataque físico direto | 7 |
| Defence | total_phy_defence | Defesa física direta | 5 |
| MagicAttack | total_magic_attack | Ataque mágico direto | 7 |
| MagicDefence | total_magic_defence | Defesa mágica direta | 5 |
| ForceHit | total_force_hit | Pontos de crítico; não chance nem multiplicador de dano crítico | 7 |
| Parry | total_parry | Pontos de bloqueio | 5 |
| Live | total_live | Vida máxima; não cura a vida corrente | 5 |
| Conat | total_conat_army | Infantaria direta; não repete a conversão da liderança | 0 |
| Penetrate | total_penetrate | Pontos de penetração, consumidos pela fórmula de bloqueio da batalha | 6 |
| StunAttr | total_stunAttr | Campo de atordoamento recuperado; todos os templates deste catálogo fornecem zero | 0 |

Os mapeamentos primários sem templates ativos não inventam bônus: só serão preenchidos se uma definição recuperada fornecer valor. Liderança já se converte em infantaria na central. `fighting_capacity` nunca vem como bônus do Cosmo: é recalculado pela fórmula central existente.

## Modificadores percentuais e especiais enviados à central

A central recebe o buffer original, valor/percentual por nível, nível da instância e origem (instância/template/buffer/slot). Calcula `magnitude`. Percentuais são expressos em unidades de 0 a 100, não frações de 0 a 1. A direção é definida pelo nome semântico; o percentual original negativo é preservado no registro.

| Campo semântico | Definição | Dados adicionais |
|---|---|---|
| damageVariancePercent | Amplitude percentual de flutuação do dano | Distribuição e aplicação pertencem à batalha |
| outgoingDamagePercent | Aumento percentual de dano causado | cannotCritical=true nos Cosmos de Ares |
| damageReductionPercent | Redução percentual do dano recebido | Não aumenta defesa física/mágica |
| flatDamageReduction | Quantidade fixa retirada do dano recebido | Não é percentual |
| criticalAvoidancePoints | Redução da chance de receber crítico em pontos percentuais | Não subtrai pontos de ForceHit |
| criticalDamageBonusPercent | Aumento do dano de um golpe crítico | Não aumenta chance de crítico |
| damageImmunityChance | Chance percentual de ignorar o dano recebido | Não é redução média de dano |
| healOnAttack | Quantidade fixa de vida por ativação ao atacar | chance=10% |
| lifeSteal | Percentual de recuperação relativo ao dano | chance=10%; cap=30.000/50.000 conforme descrição |
| reflect | Percentual de reflexão do dano | chance=10%; cap=30.000/50.000 conforme descrição |

Sem refinação, magnitude = módulo do valor/percentual do buffer × nível. Chance e teto dos procs são preservados separadamente; não multiplicados pelo nível. Os limites 30.000/50.000 são extraídos da descrição recuperada, pois não há campo estruturado equivalente. Materiais XP usam buffer tipo 23 e não entram em modificadores de combate.

Exemplos no nível 10: Sopro do Dragão → redução 30%; Luz da Sentença → bônus de dano crítico 50%; Toque da Deusa → cura de 4.000 com 10% de chance; Coração Corrompido → roubo de vida 100%, chance 10%, teto 50.000. Estes valores são propriedades calculadas para o consumidor de batalha, não garantia de execução no motor atual.

## Funções de avanço de classe: deliberadamente não implementadas

- Décimo slot (índice 9): implementado com liberação por nível 80, sem missão 1802 ou avanço de profissão; servidor e Flash alinhados.
- Refinação dos oito slots: disponibilidade por índice < vocationLevel. Não há cobrança, ganho de XP ou tentativa de refino; pedido 8772 é recusado. Slots são apresentados no grau zero.
- Elevação, área de bolsa 3, Cosmos Sagrados de qualidade 8, evolução por Pó da Ilusão e pedido 5182: não implementados. Os dez templates e suas tabelas permanecem preservados para análise, sem aquisição nem contribuição ativa.
- Nono slot (índice 8) **não exige avanço de classe no código de liberação examinado**: nível 60 + missão 1802 concluída. A implementação respeita esses requisitos, sem concluir a missão artificialmente.

## Simulação local e pontos sem evidência original

As probabilidades de qualidade e abertura da próxima bola não existem nas tabelas recuperadas. Foram isoladas em `astrologyPolicy`, com marcação local-balance; não são apresentadas como probabilidades do online. O peso é dividido igualmente entre templates elegíveis da qualidade sorteada; estágios iniciais não sorteiam Cosmos que o personagem ainda não pode usar. Qualidade 7 também pode ser adquirida pelo custo original da loja. Cosmos compostos ficam disponíveis pela loja e nono slot.

Distribuições da simulação:

```json
{
  "evidence": "local-balance",
  "nextStageChance": [
    50,
    40,
    30,
    20,
    0
  ],
  "qualityWeights": [
    {
      "1": 55,
      "2": 35,
      "3": 10
    },
    {
      "1": 40,
      "2": 35,
      "3": 20,
      "4": 5
    },
    {
      "1": 25,
      "2": 30,
      "3": 30,
      "4": 13,
      "5": 2
    },
    {
      "2": 25,
      "3": 40,
      "4": 27,
      "5": 7,
      "7": 1
    },
    {
      "3": 45,
      "4": 35,
      "5": 17,
      "7": 3
    }
  ]
}
```

Regras de empilhamento de modificadores entre sistemas, ordem de redução/escudo, interpretação do bônus crítico, frequência dos procs, base de reflexão/roubo e distribuição da flutuação continuam sendo políticas do sistema de batalha. Este módulo apenas fornece os dados recuperados e sua magnitude.

## Recursos visuais e validação

Ícones: 82/82 disponíveis após coleta. Eram 34 já presentes na verificação atual e foram obtidos mais 48; arquivos novos foram validados como SWF com tamanho descompactado consistente. Todos os ícones têm hash SHA-256 verificado. O resolvedor local trata barras duplicadas e sufixos de versão apenas dos ícones; não altera os módulos SWF de interface.

Testes: níveis de todas as qualidades comuns, contribuições fixas/especiais, material XP, absorção, cadeado, famílias, slots, compra/venda, ouro, expansão, automático, protocolo TCP, HTTP autenticado, reconexão, isolamento entre duas contas e rollback. Também foram verificadas preservação das modas e classe. Logs: `data/cosmos-focused-tests.log` e `data/cosmos-regression-tests.log`. Validação visual no AIR ainda depende de um teste no jogo.

## Catálogo e saídas por template

Arquivo `atributos-enviados.json` contém os operandos e resultados completos nos níveis 1 e 10, além da leitura não destrutiva das contas locais. O estado de contas sem cosmos ainda inicializados não foi salvo nem alterado por esse relatório.

| ID | Cosmo | Qualidade | Nível exigido | Situação |
|---:|---|---:|---:|---|
| 1 | Perdição | 1 | 1 | Temporariamente oculto |
| 2 | Profecia | 1 | 1 | Temporariamente oculto |
| 3 | Nulidade | 1 | 1 | Temporariamente oculto |
| 4 | Fonte de Energia | 6 | 1 | Material de XP |
| 5 | Energia da Estrela | 6 | 1 | Material de XP |
| 103 | Fortuna | 3 | 1 | Equipável |
| 104 | Marca dos Deuses | 4 | 1 | Equipável |
| 105 | Luz dos Deuses | 5 | 1 | Equipável |
| 107 | Divino · Leão | 7 | 1 | Equipável |
| 202 | Ruptura Militar | 2 | 1 | Equipável |
| 203 | Espírito de Combate | 3 | 1 | Equipável |
| 204 | Batalha do Imperador | 4 | 1 | Equipável |
| 205 | Poder dos Titãs | 5 | 1 | Equipável |
| 207 | Divino · Áries | 7 | 1 | Equipável |
| 208 | Sagrado · Áries | 8 | 80 | Sagrado: nível 80 |
| 302 | Resiliente | 2 | 1 | Equipável |
| 303 | Escudo Estrelar | 3 | 1 | Equipável |
| 304 | Refúgio do Caos | 4 | 1 | Equipável |
| 305 | Coração Sagrado | 5 | 1 | Equipável |
| 307 | Divino · Touro | 7 | 1 | Equipável |
| 308 | Sagrado · Touro | 8 | 80 | Sagrado: nível 80 |
| 402 | Espírito Trovão | 2 | 1 | Equipável |
| 403 | Hades | 3 | 1 | Equipável |
| 404 | Marca do Demônio | 4 | 1 | Equipável |
| 405 | Espírito do Deus Trovão | 5 | 1 | Equipável |
| 407 | Divino · Capricórnio | 7 | 1 | Equipável |
| 408 | Sagrado · Capricórnio | 8 | 80 | Sagrado: nível 80 |
| 502 | Espírito de Proteção | 2 | 1 | Equipável |
| 503 | Benção de Deus | 3 | 1 | Equipável |
| 504 | Refúgio dos Elementos | 4 | 1 | Equipável |
| 505 | Espírito da Natureza | 5 | 1 | Equipável |
| 507 | Divino · Escorpião | 7 | 1 | Equipável |
| 508 | Sagrado · Escorpião | 8 | 80 | Sagrado: nível 80 |
| 602 | Destruição | 2 | 1 | Equipável |
| 603 | Ruptura Espiritual | 3 | 1 | Equipável |
| 604 | Caminho do Furacão | 4 | 1 | Equipável |
| 605 | Espírito Violento | 5 | 1 | Equipável |
| 607 | Divino · Sagitário | 7 | 1 | Equipável |
| 608 | Sagrado · Sagitário | 8 | 80 | Sagrado: nível 80 |
| 702 | Brilho de Sangue | 2 | 1 | Equipável |
| 703 | Destino | 3 | 1 | Equipável |
| 704 | Cristal da Vida | 4 | 1 | Equipável |
| 705 | Espírito dos Imortais | 5 | 1 | Equipável |
| 707 | Divino · Aquário | 7 | 1 | Equipável |
| 708 | Sagrado · Aquário | 8 | 80 | Sagrado: nível 80 |
| 804 | Benção Divina | 4 | 40 | Temporariamente oculto |
| 805 | Espírito de Shura | 5 | 40 | Temporariamente oculto |
| 904 | Deteminação de Destruição | 4 | 40 | Temporariamente oculto |
| 905 | Espírito do Deus Ares | 5 | 40 | Temporariamente oculto |
| 1003 | Benção | 3 | 40 | Temporariamente oculto |
| 1004 | Determinação Indomável | 4 | 40 | Temporariamente oculto |
| 1005 | Toque da Deusa | 5 | 40 | Temporariamente oculto |
| 1014 | Demônio Sanguinário | 4 | 40 | Equipável |
| 1015 | Coração Corrompido | 5 | 40 | Equipável |
| 1104 | Escudo de Espinhos | 4 | 40 | Equipável |
| 1105 | Espelho de Ilusão | 5 | 40 | Equipável |
| 1204 | Magia Arcana | 4 | 40 | Equipável |
| 1205 | Olho da Morte | 5 | 40 | Equipável |
| 1304 | Benção Espiritual | 4 | 40 | Equipável |
| 1305 | Sopro do Dragão | 5 | 40 | Equipável |
| 1313 | Espírito Santo | 3 | 40 | Temporariamente oculto |
| 1314 | Proteção de Pedra | 4 | 40 | Temporariamente oculto |
| 1315 | Luz da Gaia | 5 | 40 | Temporariamente oculto |
| 1404 | Oráculo | 4 | 40 | Equipável |
| 1405 | Espírito Nulo | 5 | 40 | Equipável |
| 1502 | Alma | 2 | 1 | Equipável |
| 1503 | Tirano | 3 | 1 | Equipável |
| 1504 | Domínio Imortal | 4 | 1 | Equipável |
| 1505 | Asas do Guardião | 5 | 1 | Equipável |
| 1507 | Divino · Libra | 7 | 1 | Equipável |
| 1508 | Sagrado · Libra | 8 | 80 | Sagrado: nível 80 |
| 1604 | Morte Certa | 4 | 40 | Equipável |
| 1605 | Luz da Sentença | 5 | 40 | Equipável |
| 1705 | Ataque Violento | 5 | 60 | Slot especial: nono (60 + missão 1802) ou décimo (80) |
| 1707 | Deus·Gêmeos | 7 | 60 | Slot especial: nono (60 + missão 1802) ou décimo (80) |
| 1708 | Sagrado · Gêmeos | 8 | 80 | Sagrado: nível 80 |
| 1805 | Golpe Divino | 5 | 60 | Slot especial: nono (60 + missão 1802) ou décimo (80) |
| 1807 | Deus·Peixes | 7 | 60 | Slot especial: nono (60 + missão 1802) ou décimo (80) |
| 1808 | Sagrado · Peixes | 8 | 80 | Sagrado: nível 80 |
| 1905 | Tiro Fatal | 5 | 60 | Slot especial: nono (60 + missão 1802) ou décimo (80) |
| 1907 | Santo · Cancer | 7 | 60 | Slot especial: nono (60 + missão 1802) ou décimo (80) |
| 1908 | Sagrado · Câncer | 8 | 80 | Sagrado: nível 80 |

## Missões de Cosmos

Foram integradas as definições originais de Adquirir Cosmos (3), Trancar Cosmo (623) e Mestre Cósmico (1802). Astrologia incrementa condições ativas de tipo 36; ativar cadeado incrementa tipo 53. A contagem local é por tentativa de astrologia realizada, inclusive dentro do automático; compras na loja não fingem tentativas de astrologia. O progresso é limitado ao objetivo e só ativa o nono slot depois do resgate da missão 1802, não simplesmente ao atingir a contagem.

A missão 623 possui término em 2000-01-01 nas tabelas preservadas: sua condição é suportada caso esteja ativa, mas o módulo não reativa artificialmente esse conteúdo expirado. As missões 3 e 1802 possuem validade até 2050. Não foi criada integração para a missão avançada de Sagrado 1921.

Não foram usados dados de posse de outra conta, não houve reset ou concessão de itens às contas reais, não foi alterada a lógica das modas nem o executor de batalha e não foi executado formatter.
