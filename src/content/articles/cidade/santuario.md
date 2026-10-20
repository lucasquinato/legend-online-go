# Santuário

O **Santuário** é uma construção da cidade dedicada ao aprimoramento dos atributos do personagem e das tropas. Suas melhorias aumentam o poder de combate, a capacidade de **Infantaria** e a produção de ouro, oferecendo benefícios permanentes conforme são evoluídas.

![Interface do Santuário Comum](/images/santuario-interface.webp)

O sistema possui duas modalidades de aprimoramento: **Comum** e **Avançado**. Cada melhoria possui sua própria progressão, e os bônus das duas modalidades são acumulativos.

![Interface do Santuário Avançado](/images/santuario-interface2.webp)

## Atributos do Santuário

O Santuário oferece melhorias de **Ataque, Magia, Defesa, Resistência e Vida** tanto para o personagem quanto para as tropas. Os atributos equivalentes seguem a mesma escala de bônus, sem favorecer uma categoria em relação à outra.

Além dos atributos de combate, o Santuário oferece **Infantaria**, que aumenta a quantidade de tropas disponíveis, e **Produção de Ouro**, que contribui para a renda global do personagem.

A **Vida** é o único atributo que utiliza uma escala dobrada: em cada nível de aprimoramento, seu bônus corresponde ao dobro do valor concedido por Ataque ou Magia na mesma modalidade.

## Valores máximos dos aprimoramentos

Cada melhoria pode alcançar o **nível 80**. A tabela apresenta os bônus máximos das modalidades Comum e Avançado e sua soma, quando ambas estiverem no nível máximo.

| Atributo           | Comum (nível 80) | Avançado (nível 80) |      Total |
| ------------------ | ---------------: | ------------------: | ---------: |
| Ataque             |          +10.000 |             +13.000 |    +23.000 |
| Magia              |          +10.000 |             +13.000 |    +23.000 |
| Defesa             |           +7.000 |              +9.000 |    +16.000 |
| Resistência        |           +7.000 |              +9.000 |    +16.000 |
| Vida               |          +20.000 |             +26.000 |    +46.000 |
| Infantaria         |           +7.000 |              +9.000 |    +16.000 |
| Produção de ouro/h |       +1.000.000 |          +1.000.000 | +2.000.000 |

Os valores de Ataque, Magia, Defesa, Resistência e Vida valem para as **melhorias correspondentes do personagem e das tropas**. Já a Infantaria representa **quantidade adicional de tropas**, e não um atributo de defesa ou de vida.

Os números da tabela são bônus concedidos pelo Santuário, não os valores totais dos atributos do personagem.

## Evolução dos atributos

Os bônus aumentam **linearmente** conforme o nível de cada aprimoramento, até alcançar os valores máximos indicados. Ataque e Magia compartilham a mesma escala, assim como Defesa, Resistência e Infantaria.

A relação entre Vida e Ataque/Magia permanece de **2 para 1** em toda a progressão. Por exemplo, quando uma melhoria comum concede +5.000 de Ataque, a melhoria correspondente de Vida, no mesmo nível, concede +10.000 de Vida.

Cada melhoria é evoluída individualmente. Seu nível não pode ultrapassar o **nível atual do personagem**, que também determina o nível do Santuário, respeitando o máximo de 80.

A modalidade **Avançada** é desbloqueada quando o personagem alcança o **nível 50**. Esse desbloqueio permite começar a evoluir os atributos avançados; não concede níveis ou bônus automaticamente.

## Custos de aprimoramento

Todos os atributos de uma mesma modalidade utilizam a **mesma tabela de custos**. Cada evolução consome **Cristais de Luz**, sem custo em ouro, e a modalidade Avançada exige **cinco vezes** a quantidade de cristais da Comum.

Os valores abaixo representam o custo de uma única evolução **para alcançar o nível indicado**, e não o custo acumulado até ele.

| Nível a alcançar | Comum (Cristais de Luz) | Avançado (Cristais de Luz) |
| ---------------: | ----------------------: | -------------------------: |
|                1 |                      50 |                        250 |
|               10 |                     500 |                      2.500 |
|               20 |                   1.950 |                      9.750 |
|               40 |                   7.850 |                     39.250 |
|               50 |                  12.300 |                     61.500 |
|               60 |                  17.750 |                     88.750 |
|               80 |                  32.100 |                    160.500 |

### Custo total até o nível 80

Para evoluir **um atributo** do nível 0 ao 80, o investimento acumulado é:

| Modalidade           | Total de Cristais de Luz |
| -------------------- | -----------------------: |
| Comum                |                  858.850 |
| Avançado             |                4.294.250 |
| **Comum + Avançado** |            **5.153.100** |

Os totais são calculados **por atributo**. Como cada atributo evolui separadamente, aprimorar outros atributos exige investimentos adicionais.

## Produção de ouro

O Santuário também possui melhorias de produção de ouro nas modalidades Comum e Avançado. Ambas seguem a mesma progressão linear e podem fornecer **até 1.000.000 de ouro por hora cada**, totalizando **2.000.000 de ouro/h** quando estão no nível 80.

| Nível da melhoria |     Comum |  Avançado |     Total |
| ----------------: | --------: | --------: | --------: |
|                10 |   125.000 |   125.000 |   250.000 |
|                30 |   375.000 |   375.000 |   750.000 |
|                50 |   625.000 |   625.000 | 1.250.000 |
|                60 |   750.000 |   750.000 | 1.500.000 |
|                70 |   875.000 |   875.000 | 1.750.000 |
|                80 | 1.000.000 | 1.000.000 | 2.000.000 |

O ouro fornecido pelo Santuário integra a **Produção Global de Ouro/h** do personagem. Portanto, além de contribuir para a geração automática de ouro a cada minuto, também aumenta o valor dos impostos coletados na Prefeitura.

### Exemplo de produção

Um personagem no nível 80, com a Prefeitura produzindo **5.000.000 de ouro/h** e as duas melhorias de ouro do Santuário no nível máximo, terá uma produção global de **7.000.000 de ouro/h**, antes de considerar outras fontes e modificadores.

Nesse cenário, cada coleta de impostos da Prefeitura concede **7.000.000 de ouro**, pois equivale a uma hora da produção global vigente.

## Confirmação das melhorias

Sempre que um aprimoramento do Santuário for concluído com sucesso, o jogo enviará uma mensagem no canal **`[MSG]`** do chat, informando a melhoria realizada e seu novo nível.

Caso uma tentativa não seja concluída com sucesso, nenhum novo bônus será concedido e não haverá mensagem de confirmação de sucesso.

## Sistemas relacionados

Consulte também a [visão geral](../visao-geral.md) e o [Dev Log](../desenvolvimento/dev-log.md).
