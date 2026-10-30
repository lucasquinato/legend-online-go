# Entrega das tatuagens

Implementação: src/features/tattoo. Regras e escolhas locais: src/features/tattoo/README.md.

## Verificação

- 7 testes unitários de tatuagens passaram.
- 2 testes de integração passaram (correio, TCP, persistência, reconexão, rollback e tabelas).
- TypeScript: check e build passaram.
- 11 testes do contrato SWF passaram.
- AIR: carregamento conjunto das interfaces, gates e tooltips das tatuagens, gates de runas e busca de títulos passaram. Baselines reproduziram os bloqueios anteriores esperados.
- Auditoria módulo 5: 407 classes preservadas, 13 métodos autorizados no derivado completo; apenas quatro métodos adicionais para tatuagens. Construtores e métodos/tags fora do contrato preservados.
- HTTP local: índices, módulo 5 e tabelas respondem 200 com hash/tamanho conferidos.
- Validado backup e preservação de player, hero, itens, missões, coleção e progressão de modas das três contas após reinício.
- Interação visual completa no launcher ainda depende do teste do jogador; os probes não substituem essa etapa.

## Suíte geral

A execução de 754 testes terminou com 749 aprovados e cinco falhas fora do fluxo novo. Não foi declarada aprovação integral da suíte. Os dois testes de integração adicionados posteriormente foram executados separadamente e passaram.

- forja não implementada restaura o slot otimista e não altera o item ou seus atributos (373.1145ms)
- anexos, modas e atributos persistem sem recompensa duplicada e aceitam outra ordem (427.7682ms)
- erros reais de duas contas passam pela central e conservam destinatário e recursos (888.0407ms)
- módulo da campanha atende offline o nome versionado publicado pelo Flash sem alterar o acervo online (462.5654ms)
- timer TCP envia pacotes com o SQLite bloqueado (4193.9999ms)

Três expectativas ainda exigem forja não reconstruída ou rejeição antiga de consumo. O teste de recurso da campanha retorna 503 no fixture offline; o teste de timer TCP não recebe o pacote esperado com SQLite bloqueado. As duas últimas falhas também reproduziram em execução isolada. Não foram alterados os testes ou essas funcionalidades para acomodar a entrega das tatuagens.

## Suprimentos

50 emails por conta para pirata_teste, pirata_teste_2 e pirata_teste_3: 200 packs de 9999 materiais básicos; 40 packs de 9999 avançados; 1 pack de 9999 pedras; 500000 diamantes comuns e 500000 vinculados. Anexos retirados sob demanda, sem lotar automaticamente a mochila. Concessão idempotente. Arquivos test-mail.json e deployment.json registram backup, IDs, limite do pacote postal e saúde do processo local.
