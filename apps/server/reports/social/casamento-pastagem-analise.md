# Casamento e pastagem — evidências do cliente (sem nova integração)

## Onde aparece e quem pode interagir
`farm.newview.PastureView` inclui `farm.view.marrytree.MarryTreeView`. Trata-se da **árvore matrimonial** dentro da pastagem; não é evidência de fundir automaticamente os animais, moedas, slots ou inventários do casal.

A árvore possui estado próprio e estado do parceiro (`treeState` e `mateTreeState`). O cliente usa o primeiro na pastagem própria e o segundo ao visitar a do cônjuge. A árvore é ocultada na própria área quando `marriangeState == 0` e, em visitas, quando o dono não é o parceiro informado em `selfMarryInfo.userId`. Esse gate visual não decide sozinho se noivado pode conceder todas as ações: essa regra precisa ser definida no servidor. As descrições e as funções estão relacionadas ao casamento.

## Estados exibidos e comandos
| Estado | Visual | Clique do cliente |
|---:|---|---|
| 0 | Árvore sem tarefa de cuidado ativa | Abre cultivo, somente na própria árvore |
| 1 | Ervas | 8773/1003, incluindo ID do dono visitado |
| 2 | Vermes | 8773/1003, incluindo ID do dono visitado |
| 3 | Colheita disponível | 8773/1004 |
| 4 | Ícone de água/limite | Mostra aviso de limite de colheita; não envia colheita |

A aparência de água no estado 4 não deve ser interpretada como regar livremente: o handler desse clique é um aviso. Rega/evolução são feitas na janela de cultivo pelo comando 1006.

## Cultivo, manutenção e progressão
- `MarryTreeFosterFrame` recebe o estado da árvore, mostra nível, XP, barra de estado de 0 a 1.000 e prévia dos itens colhidos no nível atual/próximo.
- **A janela atual usa tabela de upgrade tipo 121**, dez linhas, graus 0–9. O código provisório antigo do servidor referenciava tipo 37; não se deve assumir que ele representa esta janela atual.
- `TemplateName` da tabela 121 contém itens/quantidades da colheita. Por exemplo, grau 0 mostra `208034,50`. A análise preservou todas as dez linhas em `reference/social/cycle-tables.json`, campo `PastureTreeUpgrades`.
- A contagem nativa é `treeEarningDate + 43.200 segundos`: 12 horas. O tempo é baseado na data informada pelo servidor, portanto pode continuar offline.
- Cultivar envia 1002. A janela dispõe de slots de alimentação e filtra itens com `GoodsTemplate.Feed > 0`. Move uma unidade por slot para a bolsa temporária 0, pelos comandos comuns de movimentação de itens. Não é equivalente a consumir qualquer item de mochila.
- A janela limita os slots por `mar_tree_train_count=10`; habilita cultivo quando há itens e o tempo permite. Também há gate para o valor de estado em 800, mas o AS3 recuperado possui trechos incompletos em `setAddTxt` e variáveis locais não preenchidas. Não é possível derivar com segurança toda a fórmula de rendimento/alimentação desses trechos.
- Atualizar a seleção de itens envia 1005. Referencia `fresh_martree_item`, com fallback visual de 100.000 ouros; o valor configurado precisa ser conferido antes de implementar essa cobrança.
- 1003 cuida de ervas/vermes na árvore indicada; **não é colheita**, apesar de o handler provisório do servidor antes agrupar 1003 e 1004.
- 1004 é a colheita; deve respeitar estado, titular e recompensa da tabela, sem prêmio fixo inventado.

## Custos e limites recuperados
| Ação/configuração | Valor |
|---|---:|
| Cultivar (`marriage_tree_train_gold`) | 1.000.000 ouros |
| Intervalo (`marriage_tree_train_cd`) | 12 horas |
| Rega com ouro (`marriage_tree_gold`) | 10.000.000 ouros |
| XP da rega com ouro | 5 |
| Regas com ouro por dia | 5 |
| Rega com diamantes | 10 |
| XP da rega com diamantes | 50 |
| Regas com diamantes por dia | 5 |

1006 usa `pay_type`: 0 ouro, 1 diamantes, 2 diamantes com autorização de vinculados. A tabela 121 aponta itens matrimoniais nas recompensas; isso conecta a árvore ao abastecimento da felicidade e do anel. Não há prova de conceder atributos de personagem diretamente por nível da árvore.

## Sincronização esperada
357 possui `god_tree`/`MarriageGodTreeMsg`: nível, XP, estado próprio, valor de estado, contadores de rega, data e estado do parceiro. O cliente também observa 4678 (`MarriageTreeMsg`) e notificações `MARRIAGE_DATA`/`TREE_CHANGE_CLIENT`. Visitar o cônjuge deve carregar dados do dono real e atualizações precisam refletir no visitante e titular; não pode usar uma fazenda capturada ou estado duplicado localmente.

Ações devem validar casamento/vínculo, titular da área, estado e inventário no servidor. O cliente é a referência de interface e protocolo; não comprova sozinho chances de pragas, escalas de alimentação, distribuição de colheita entre parceiros ou partilha de animais.

## Pontos para decisão antes da implementação
1. Manter árvores individuais que o cônjuge ajuda, conforme os dois estados e o dono visitado, ou adotar árvore única do casal?
2. Se manter o original aparente, definir titularidade da colheita e limites de ajuda por parceiro; não liberar roubo de árvore matrimonial só porque a pastagem permite visitar amigos.
3. Confirmar consumo real dos itens `Feed`, fórmula da barra e rendimento em estado cheio; o AS3 disponível não fornece uma fórmula completa confiável.
4. Definir o destino de árvore, cultivo, itens nos slots temporários e colheita pendente em divórcio/novo casamento.
5. Animais e produção comuns continuam separados até haver regra explícita. Não foi encontrada evidência de compartilhamento automático como consequência de casar.

**Nenhuma dessas regras novas foi aplicada.** O handler 8773 provisório já existia e contém divergências conhecidas (tipo de tabela e agrupamento de cuidado/colheita). Ele ficou fora desta entrega, como solicitado. O novo pacote nativo 357 não acrescenta estado da árvore.

Evidências: `reports/social/andrew-evidence/scripts/farm/newview/PastureView.as`, `reports/social/andrew-evidence/scripts/farm/view/marrytree/MarryTreeView.as`, `reports/social/marriage-cycle-evidence/scripts/marry/income/MarryTreeFosterFrame.as`, protocolo matrimonial do core fixado e tabelas originais preservadas.
