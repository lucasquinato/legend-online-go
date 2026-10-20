# Fazenda

A **Fazenda** é uma área de produção em que o personagem cultiva plantas, acompanha seu crescimento e realiza colheitas para obter recursos e experiência. Cada cultivo utiliza uma semente, ocupa um terreno disponível e segue o tempo de maturação definido para aquela planta.

Além das próprias plantações, o jogador pode desenvolver seus terrenos, cuidar das culturas e interagir com as fazendas de amigos.

![Interface da Residência](/images/residencia-interface.webp)

![Interface da Fazenda](/images/fazenda-interface.webp)

## Nível e experiência

A Fazenda possui **nível e experiência próprios**, com progressão limitada ao nível atual do personagem. Colheitas e outras atividades elegíveis concedem experiência conforme as regras de cada interação.

O nível da Fazenda determina, entre outras coisas, a quantidade de terrenos disponíveis e o acesso à melhoria do solo. Evoluir o personagem não eleva automaticamente o nível da Fazenda: é necessário desenvolver a propriedade por meio de suas atividades.

## Terrenos de cultivo

A Fazenda começa com **três terrenos disponíveis** e libera mais um a cada cinco níveis de Fazenda, até o limite de **18 terrenos**.

| Nível da Fazenda | Terrenos disponíveis |
| ---------------: | -------------------: |
|               10 |                    5 |
|               30 |                    9 |
|               50 |                   13 |
|               60 |                   15 |
|               70 |                   17 |
|               80 |                   18 |

Cada terreno mantém seu próprio estado de plantio, crescimento e colheita. O desbloqueio de um terreno não altera as plantações existentes.

## Sementes e plantio

As sementes são adquiridas na **loja da Fazenda**, respeitando os itens, preços e moedas definidos em cada oferta. Depois da compra, ficam disponíveis no inventário do personagem.

Para iniciar um cultivo, o jogador seleciona uma semente e um terreno livre. **A semente é consumida ao plantar**, sendo necessário obter outra unidade para realizar um novo plantio depois da colheita.

Cada planta possui características próprias, como requisito de nível, tempo de maturação, experiência e recompensas. Algumas sementes podem ter disponibilidade especial e não precisam estar permanentemente à venda.

## Crescimento e colheita

O crescimento das plantas é controlado por tempo e **continua mesmo quando o personagem está desconectado**. Ao atingir a maturidade, a plantação pode ser colhida, desde que suas condições permitam a ação.

As colheitas concedem as recompensas previstas para a semente, que podem incluir ouro, outros recursos ou itens, além da experiência aplicável. Após a colheita, o terreno volta a ficar disponível para um novo plantio.

Durante o crescimento, a planta pode exigir cuidados, como retirar ervas daninhas e vermes ou recuperar uma plantação que tenha morrido. Esses estados devem ser resolvidos conforme as ações e os requisitos próprios de cada cultivo.

## Melhoria do solo

A **melhoria do solo** é desbloqueada quando a Fazenda alcança o **nível 30**. Ela possui dez níveis e permite reduzir o tempo necessário para as plantas amadurecerem e aumentar a quantidade obtida nas colheitas.

Cada nível adicional concede **2% de redução do tempo de maturação** e **3% de aumento da quantidade colhida**. Esses bônus dizem respeito às plantações da Fazenda.

| Nível alcançado | Custo em diamantes | Redução de tempo acumulada | Aumento de colheita acumulado |
| --------------: | -----------------: | -------------------------: | ----------------------------: |
|               2 |                 18 |                         2% |                            3% |
|               3 |                 27 |                         4% |                            6% |
|               4 |                 45 |                         6% |                            9% |
|               5 |                 75 |                         8% |                           12% |
|               6 |                120 |                        10% |                           15% |
|               7 |                183 |                        12% |                           18% |
|               8 |                267 |                        14% |                           21% |
|               9 |                375 |                        16% |                           24% |
|              10 |                510 |                        18% |                           27% |

Os custos apresentados correspondem à evolução **para o nível indicado**, não ao investimento acumulado até ele.

## X-Clique

O **X-Clique** reúne em um único comando as ações que o jogador poderia realizar manualmente nas plantações e que estejam disponíveis naquele momento.

Por exemplo, se houver plantas maduras para colher e outras que precisem de limpeza, o X-Clique executará as interações elegíveis sem exigir que o jogador clique em cada terreno separadamente.

O recurso **não planta sementes, não realiza compras, não remove plantações e não gasta diamantes automaticamente**. Cada interação respeita seus requisitos e recursos disponíveis. Se uma ação não puder ser concluída, as demais ações válidas ainda poderão ser processadas.

## Visitas e ajuda de amigos

É possível visitar fazendas de amigos e realizar interações permitidas nas plantações deles. Ajudar com cuidados concede experiência conforme os limites aplicáveis à atividade.

Também é possível **roubar parte da colheita** quando a planta e os limites da interação permitirem. A quantidade retirada é descontada da recompensa que restaria ao proprietário; ela não é criada em duplicidade.

Na configuração atual, uma mesma colheita admite até **três roubos**, com no máximo um por visitante, além de um limite diário de **200** para essa atividade. Cada cuidado de ajuda concede **1 ponto de experiência**, respeitando o teto configurado de **500 pontos de experiência por dia** provenientes de ajuda a amigos.

## Árvore e frutos

A Fazenda também possui uma árvore com progresso e recompensas próprios. Sua interação envolve ações periódicas, auxílio de amigos e obtenção de frutos, conforme os requisitos da atividade.

A energização da árvore possui um intervalo de **10 minutos**, e amigos também podem contribuir. Os frutos concedem recompensas e experiência do personagem conforme as regras da árvore.

Os contadores diários relacionados à árvore e aos frutos seguem o **reinício global das 04:00**, inclusive depois de uma reconexão. Esse horário não altera o tempo de maturação das plantações que já estiverem em andamento.

## Síntese de itens

A Fazenda possui uma interface de síntese destinada a receitas específicas. Foram identificadas **sete receitas originais** em duas categorias, que devem conservar seus materiais, quantidades e demais regras originais.

**A execução dessas receitas ainda não está disponível:** faltam dados confiáveis sobre a taxa de sucesso ou falha, e a síntese não deve consumir materiais até que essas condições sejam recuperadas e implementadas. Não serão adicionadas receitas ou probabilidades arbitrárias.

## Sistemas relacionados

Consulte também a [visão geral](../visao-geral.md) e o [Dev Log](../desenvolvimento/dev-log.md).
