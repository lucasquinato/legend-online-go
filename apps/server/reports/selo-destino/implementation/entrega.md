# Implementação e entrega

Selo avançado em src/features/soul-seal e Destino em src/features/fate. As regras e decisões locais estão nos README dos módulos.

- Selo comum preservado; continuação 80/80 → nível 80–100; 720 itens/nível; +5 pontos percentuais por nível, até +500% nas gemas.
- Destino: três linhas nível 0–30, XP original, 1 item/XP como regra local explícita. Destruição: até 14000 nos quatro atributos de combate e 140000 vida. Tenacidade: até 14000 intensidade e tenacidade. Determinação: até 30000. Ratings não executam efeitos próprios em combate.
- Procs separados no PVP: 20% de chance, magnitude até 30%, sorteio depois do ataque completo e duração até o próximo ataque recebido. Redução de defesas é debuff no alvo; redução de dano/reflexão são buffs no defensor.
- 95 testes de regressão passaram; rodada final de nove testes novos passou, incluindo falha que desbloqueia os botões da Roda. Integração de PVP/cidade: 17 testes passaram. Contrato SWF: 12 testes passaram. TypeScript compilou.
- Builds AIR dos módulos 2/5 passaram, preservando Modas, Loja, Habilidades, ferreiro, runas e tatuagens. HTTP conferido por hash e índices.
- Os ícones nativos das três linhas e materiais necessários foram preservados em data/assets.
- Backup consistente antes dos emails: C:\Users\Lucas Rodrigues\Downloads\LegendOnline\wartune_server\data\backups\soul-fate-mail-2026-10-20T08-56-53.859Z.
- Cada conta recebeu três emails com 14400 Selos da Alma, 26735 Pedras do Destino, 26735 Selos da Tenacidade e 26735 Esferas da Determinação. Não foram aplicados upgrades automaticamente. Concessão idempotente, com desconto de materiais existentes e anexos pendentes.
- Servidor tutorial/local ativo; captura TCP/HTTP desativada. Verificação em deployment.json.

Os testes AIR cobrem carregamento e expressões reais com fixtures de UI. A interação visual completa das janelas deve ser conferida após reabrir o launcher; não foi declarada concluída essa validação manual.
