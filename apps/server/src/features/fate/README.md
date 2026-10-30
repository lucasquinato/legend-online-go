# Proteção do Destino

Módulo por conta, liberado no nível 55, com as três linhas presentes na lista
nativa 4544. Consulta 8628; treino 8626; giros 8627/4545. Não usa replay de outra
conta. XP total, contador por linha e dia de reset ficam no save. O calendário
central reseta os contadores às 04:00, inclusive após desconexão.

A curva recuperada é conservada: níveis 0–30, 26735 XP em cada linha.
**Regra local explícita:** um material fornece um ponto de XP. O cliente não
permitia comprovar essa conversão do servidor original. A concessão de teste
usa exatamente essa regra, sem recorrer a uma hipótese oculta.

Custos de giro: um gratuito por dia/linha, depois 10/20/.../100 diamantes e
100 por giro seguinte. Exclusão dos dois menores setores custa mais 120 por
giro. O pagamento vinculado consome vinculados primeiro, depois comuns.
Pesos originais e setores 2/4/6/8/20 foram preservados. Giro e pagamento fazem
parte da transação do inventário; mochila cheia ou saldo insuficiente revertem
tudo. A resposta negativa 4545 desbloqueia os controles nativos.

## Bônus definidos pelo usuário

- Destruição: piso(14000 * nível/30) para ataque, magia, defesa e resistência;
  piso(140000 * nível/30) para vida.
- Tenacidade: escala original de 150 pontos/nível até 20, depois 200 pontos/nível,
  multiplicada por 2,8. Máximo 14000 de intensidade e tenacidade.
- Determinação: 1000 pontos/nível, máximo 30000.

Os três ratings são operandos brutos da central e chegam ao HeroInfo e ao
SimpleHeroInfo; **não são lidos pelo motor de dano/atordoamento**. Os efeitos
condicionais são uma camada distinta, expressa nos modificadores fate*.

## Efeitos PVP após o ataque

Somente heróis identificados em Engine.players de lados opostos participam.
Campanha, tutorial e labirinto continuam sem esses procs.

O ataque inteiro resolve dano, bloqueio, crítico, escudos e reflexões anteriores
antes do sorteio. Após finalizar a ação: Destruição do atacante tem 20% de
chance de colocar no alvo dois debuffs (defesa física e mágica); Tenacidade e
Determinação do defensor atingido rolam separadamente 20% para redução de dano
e reflexão. A magnitude é o nível da linha, de 1% até 30%.

**Duração local explicitada:** cada resultado fica válido para um próximo
ataque recebido completo, incluindo seus múltiplos impactos. Não expira só
porque o portador agiu e não altera o ataque que o ativou. Após ser utilizado,
é removido antes de sortear substitutos. Efeitos da mesma família renovam em
vez de empilhar; reflexão não provoca reflexão recursiva. A flag fate é
serializável no motor. Mensagens de inclusão e remoção usam o protocolo de
buffs existente. Os ícones e descrições ficam nos templates locais.

## Verificação

Testes unitários e de cidade: progressão, pilhas, máximo, recurso insuficiente,
pagamento, mochila cheia, rollback, email, protocolo, reconexão, preservação de
Modas/tatuagens/missões/classe, primeiro ataque sem proc retroativo e consumo
dos buffs no ataque seguinte. Regressão inclui PVP real de dois clientes.

Relatórios e concessão de materiais: reports/selo-destino/implementation/.
