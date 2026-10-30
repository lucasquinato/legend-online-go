# Moedas

Os sete saldos usam `CurrencyLedger` para aquisição e consumo. Cada lançamento
registra conta, moeda, origem, identificador da operação, variação e saldos anterior
e posterior em `currency_transactions`.

| Moeda | Campo original | Modelo TCP |
| --- | --- | --- |
| Ouro | `economy.gold_total_count` | 109 |
| Diamante | `player.point` | 3 |
| Diamante vinculado | `player.gift_token` | 3 |
| Espírito | `player.strategy` | 3 |
| Cristal de Luz | `economy.crystals_count` | 109 |
| Energia | `player.weary` | 3 |
| Moeda do Labirinto | `packets.4725.message.tokenInfos[masterType=11].amount` | 4725 |

`catalog.ts` define os campos e a validação. `ledger.ts` concentra os lançamentos;
`index.ts` é a entrada do módulo. `CityWorld.changeCurrency` faz um lançamento,
salva o personagem e responde com o modelo da moeda na mesma operação atômica.
Dentro de uma ação com mais custos, `changeMany` valida e aplica todos, ou nenhum.
O host deve incluir os lançamentos e seu save na mesma transação SQLite.

Quantidades devem ser inteiras, saldos não podem ser negativos e identificadores
de operação impedem cobranças ou créditos repetidos. A mesma operação com outra
origem ou quantidade é recusada. Os limites numéricos protegem a serialização:
INT32 nas seis moedas correspondentes e inteiros seguros de JavaScript no
espírito, cujo protocolo é INT64. Não representam novos limites de gameplay.

A API antiga de ouro e `gold_transactions` continuam disponíveis por um
adaptador. Assim, venda, bolsas de ouro, recrutamento e o módulo finalizado de
modas usam a centralização sem mudar suas regras.

Os fluxos implementados de missões, combates, construção, fazenda, recompensas
por tempo e correio passam por esse serviço. Respostas capturadas aplicam a
variação de saldo, nunca substituem o saldo atual pelo da conta de referência.
Isso também vale para snapshots completos do modelo de tokens do labirinto.

Anexos monetários originais de `ItemTempInfo`: -100 ouro, -300 espírito,
-400 diamantes, -500 diamantes vinculados, -600 cristal de luz. O -700 é XP e
usa `src/progression.ts`; -200 é ametista, não energia. Energia e moeda do
labirinto não receberam IDs de correio inventados. O item físico 208009 permanece
um item: sua conversão em saldo requer a regra específica, ainda não capturada.

Diamantes livres e vinculados têm saldos independentes. Cada funcionalidade
deve declarar qual moeda aceita e sua prioridade de gasto; o serviço não troca
uma pela outra automaticamente. Centralizar os saldos não implementa lojas,
recargas ou recompensas que ainda não têm regras recuperadas.

O backend usa somente suas próprias tabelas, banco e referências. Não acessa a
pasta do cliente em execução.
