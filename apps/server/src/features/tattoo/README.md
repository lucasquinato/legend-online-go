# Tatuagens

Módulo isolado de progressão por conta, integrado ao inventário, à contabilização
central de moedas e à central de atributos. Não altera missões nem profissão.

Espaços disponíveis: nível 70 = 2; 72 = 4; 74 = 5; 76 = 6; 78 = 7;
80 = 8. Gravações abrem no 80. Propostas de lavagem persistem entre logins,
mas só a substituição confirmada fornece atributos. Substituir troca a fonte,
sem acumular as versões anteriores. O negativo reduz o primário correspondente
antes das conversões em ataque, defesa, vida e liderança. O total do personagem
não fica negativo. Gravações amplificam somente a contribuição das tatuagens.

## Evidência recuperada

- Mensagens `9568/274` e `9603/346`, inclusive o campo original `holdId`.
- Material básico `208101`, avançado `208102`, 100 unidades por lavagem.
- Fórmulas de incremento positivo de `TattooPopFrame`: limite básico 2000,
  avançado 5000; tipos 0 força, 1 proteção/agilidade, 2 inteligência,
  3 liderança e 5 físico.
- Travas de família de atributo custam 10 diamantes cada; pagamento vinculado
  usa primeiro o vinculado e completa com diamantes comuns.
- Pedra de gravação `208056`, custo 1/2/3/4 conforme posição; bênção de
  500 diamantes comuns. Tabela 119 possui dez níveis de 5% a 50%.
- `TattooModel.calculateAddProperty` aplica o percentual à soma líquida das
  tatuagens, truncando o bônus. A chance exibida de gravação soma os dois
  primeiros pesos de `TemplateName`.

## Escolhas locais sem captura comprobatória

`localTattooPolicy` explicita as regras que o cliente não determina:
famílias sorteadas com pesos iguais; redução acumulada limitada a 10000;
quatro gravações de força, proteção, inteligência e físico; sucesso sobe um
nível e falha conserva o nível. Compra automática custa 1/3 diamantes por
tintura básica/avançada. Duas cotações ocultas foram adicionadas à tabela de
loja para o cliente calcular essa compra, sem editar ofertas existentes.
Essas escolhas não são apresentadas como regras comprovadas do online.

## Interface e verificação

`build-formation-ui.mjs` parte do módulo 5 fixado pelo release-lock, preserva
as demais classes e altera quatro métodos de apresentação: aba no nível 70,
tooltips dos oito espaços e gravação no 80. O auditor protege Modas e todas
as classes fora do contrato. O probe AIR testa os gates, as mensagens de
bloqueio e o carregamento das interfaces compartilhadas; o baseline deve
reproduzir o bloqueio antigo por profissão. Cópias com aliases são somente
fixtures e nunca entram no módulo publicado. A interação visual completa no
launcher ainda depende do teste do jogador.

Correção da aba vazia: o fluxo próprio usa `new TattooView()` com
`_thaneInfo=null`. A condição de nível da gravação consulta agora
`ArmyManager.instance.thane.grades`; `_thaneInfo` continua reservado à inspeção
de outro personagem. O teste anterior preenchia indevidamente esse campo e
não reproduzia o construtor real. O probe passou a exigir o campo nulo e a
validar também a apresentação de inspeção. O build reproduz o erro #1009 na
versão defeituosa preservada em `reference/tattoo/evidence/blank-tab-5.swf`
e exige o marcador `tattoo-self-view-null-safe-passed` no candidato.

`test/tattoo.test.ts` cobre progressão, mensagens, propostas, substituição,
consumo de pilhas, pagamentos, rollback, redução de atributos, gravações e
isolamento. `scripts/grant-tattoo-test-mail.ts` envia materiais idempotentes
às três contas sem modificar seus personagens e valida o limite do pacote
da caixa postal. Cria backup SQLite consistente antes do envio.
