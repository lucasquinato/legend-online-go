# Prefeitura

![Interface da Prefeitura](/images/prefeitura-interface.webp)

A **Prefeitura** é uma construção da cidade responsável pela produção contínua de ouro e pela arrecadação de impostos. Seu nível acompanha automaticamente o nível do personagem, sem exigir melhorias independentes.

Além da renda gerada pela própria construção, a Prefeitura permite realizar coletas diárias de impostos calculadas sobre a produção global de ouro do personagem.

## Nível e produção de ouro

A Prefeitura acompanha o personagem do **nível 10 ao 80**. Sua produção-base aumenta de maneira linear, começando em 500.000 de ouro por hora e alcançando 5.000.000 de ouro por hora no nível máximo.

| Nível | Produção-base por hora |
| ----: | ---------------------: |
|    10 |        500.000 de ouro |
|    30 |      1.785.714 de ouro |
|    50 |      3.071.429 de ouro |
|    60 |      3.714.286 de ouro |
|    70 |      4.357.143 de ouro |
|    80 |      5.000.000 de ouro |

Os valores intermediários da tabela estão arredondados para apresentação. A progressão segue uma linha reta entre os níveis 10 e 80.

Embora a taxa seja expressa em **ouro por hora**, o ouro é gerado e concedido **a cada minuto**. O personagem recebe uma mensagem no chat informando a quantidade obtida em cada geração.

## Produção Global de Ouro

A **Produção Global de Ouro/h** é um atributo do personagem que reúne a renda recorrente proveniente da Prefeitura e de outros sistemas, incluindo os bônus aplicáveis à geração de ouro.

A taxa global é utilizada tanto para determinar a geração automática de ouro quanto para calcular os impostos. Assim, melhorias que aumentam a produção global também elevam o valor das futuras coletas de impostos.

A produção da **Residência** é uma exceção: ela possui armazenamento e coleta próprios e não integra a Produção Global de Ouro/h nem o cálculo dos impostos.

## Impostos

Cada coleta de impostos concede ao personagem o equivalente a **uma hora de sua Produção Global de Ouro/h**, considerando o valor vigente no momento da coleta.

O jogador pode realizar **cinco coletas por dia**, correspondentes a até cinco horas extras de produção global. A primeira coleta pode ser realizada imediatamente, desde que esteja disponível; depois, é necessário aguardar **10 minutos** entre as coletas.

Personagens com **VIP ativo** não precisam aguardar esse intervalo e podem realizar as cinco coletas em sequência. O VIP não aumenta o limite diário de coletas.

As coletas disponíveis são renovadas diariamente às **04:00**, conforme o horário global do servidor. Uma recarga iniciada antes da virada do dia continua válida após o reinício diário, exceto quando o personagem possuir VIP ativo.

### Exemplo de arrecadação

Um personagem no nível 80 possui 5.000.000 de ouro/h de produção-base da Prefeitura. Se o Santuário fornecer outros 2.000.000 de ouro/h, sua Produção Global será de **7.000.000 de ouro/h**, desconsiderando outras fontes e modificadores.

Nesse caso, cada imposto concederá **7.000.000 de ouro**, e as cinco coletas renderão **35.000.000 de ouro adicionais** ao longo do dia.

Caso a produção global aumente entre duas coletas, o novo valor será considerado apenas nas coletas seguintes; o ouro já recebido não é recalculado.

## Sistemas relacionados

Consulte também a [visão geral](../visao-geral.md) e o [Dev Log](../desenvolvimento/dev-log.md).
