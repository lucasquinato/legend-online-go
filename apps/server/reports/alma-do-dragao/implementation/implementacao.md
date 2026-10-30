# Alma do Dragão — implementação local

O módulo está em `src/features/dragon-soul/`, com tabelas preservadas em `reference/dragon-soul/`. Não lê a pasta do cliente. Os SWFs e a funcionalidade de Modas não foram modificados.

## Regras implementadas

- Abre no nível 40. Evolução comum limitada aos graus 1/2/3/4/5 nos níveis 40/50/60/70/80. Rejeição informa o próximo nível e não consome materiais.
- Uma Alma comum fornece 1 XP. Alimentação individual consome uma; rápida preenche somente a próxima etapa, usando no máximo o disponível e sem desperdício.
- Etapa 101 concluída -> Coração, tipo 102 grau 1, sem custo e sem modificar profissão, classe ou personagem. Os sete upgrades seguintes seguem os valores da tabela.
- Coração grau 8 + personagem 80 -> despertar gratuito para Sagrado tipo 153 grau 0 pelo botão nativo.
- Sagrado: um material = um ponto da necessidade da tabela. Cada clique compra um passo inteiro, consumindo exatamente Data; se faltar material, rejeita sem consumo parcial. Esse comportamento segue o clique/custo observado no online. São 600 passos, até nível visual 100, custo total 67200 materiais.
- Bônus fixos e percentuais da etapa comum permanecem ao avançar; tabela Sagrada acrescenta seus bônus. A central aplica percentuais à camada final do personagem, após conversão de primários, como as outras fontes.
- Estado próprio, persistência e transações com rollback. Pacote 4555 sempre deriva da conta local, inclusive se uma captura tentar fornecer outro estado.

## Reduções elementais

A fonte central dragonSoul contém elementalReductions. AttributeCalculator.snapshot disponibiliza os percentuais agregados do personagem para vento, água, fogo, eletricidade, luz, trevas e os três pares combinados dos buffers originais. Os marcos da tabela são respeitados.

Esses percentuais não viram pontos de resistência (windResi etc.) e não entram nos modificadores de combate. O motor de batalha não foi alterado. Os campos percentuais não existem no protobuf de atributos do cliente: ficam no modelo central e nas fontes persistidas; a interface nativa indica as passivas ativas pelo grau informado em 4555.

## Decisões provisórias para validação visual

1. Transição para Coração gratuita e automática ao concluir a Alma de Combate, sem exigir a cadeia de profissão 757.
2. Despertar Sagrado gratuito. Nenhum ouro, diamante ou material adicional foi inventado.
3. Alimentação rápida preenche a próxima etapa, não toda a árvore. Não existe rolagem de benção ou ganho aleatório implementado.
4. Percentuais usam a camada central existente; a base exata do servidor online não foi confirmada.

As decisões estão identificadas também em dragonPolicy. O custo por passo Sagrado foi mantido conforme tabela e captura, não é uma dessas hipóteses.

## Materiais entregues

Foram enviados dois emails por conta. As pilhas respeitam o máximo 9999, e o total necessário foi descontado do que a conta já possuía:

| Conta | Alma comum enviada | Alma Sagrada enviada |
|---|---:|---:|
| pirata_teste | 8161 | 67200 |
| pirata_teste_2 | 8153 | 67200 |
| pirata_teste_3 | 8161 | 67200 |

Cada conta fica com os 8193 materiais comuns necessários e 67200 Sagrados considerando o estoque anterior. Não foram resetadas nem evoluídas automaticamente. A entrega usa chaves idempotentes e foi precedida de backup SQLite. IDs, backup e conferência do tamanho dos pacotes postais estão em test-mail.json.

## Validação

- Três testes específicos: curva completa, materiais, bloqueios, fontes, protocolo real, correio, reconexão, rejeição de estado capturado e rollback SQLite.
- 93 testes de regressão passaram em atributos, inventário, combate, Selo/Destino, Cosmos, montaria, tatuagens e títulos antes do último reforço de autoridade de 4555; os três específicos passaram novamente após esse reforço.
- Build TypeScript passou.
- As quatro classes das telas foram carregadas e resolvidas no AIR real; isso não substitui o teste visual de cliques no launcher.
- Ícones dos materiais preservados no cache do backend; material-icons.json registra os hashes e os retornos HTTP.
- Servidor local reiniciado em modo tutorial, captura TCP/HTTP desligada. deployment.json confirma a entrega e preservação do estado das contas.
