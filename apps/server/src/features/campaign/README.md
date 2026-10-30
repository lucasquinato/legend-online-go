# Campanhas

Mensagens de ganhos: além da XP positiva por batalha, o canal INFO anuncia a XP final após a conclusão remunerada e o nome/quantidade do item após a primeira entrega da carta à mochila. Essas mensagens são emitidas junto com a transação bem-sucedida; recarregar o relatório, escolher novamente ou reconectar não reapresenta um ganho antigo. Entradas sem recompensa e entregas rejeitadas não anunciam ganhos. As tabelas das 83 fases definem `HeroGp=0` no encontro final do boss: a XP daquele momento vem de `Campaigns.BaseGp`, pela conclusão, sem crédito extra inventado. Conferência: `reports/campanhas/mensagens-ganhos.json`.

Atualização de recompensas: o bot mantém 15 segundos por fase e envia status 7 com a nova conclusão e a tentativa pendente para atualizar a lista. O status 9 retorna antes de `MopupModel.commit()` no cliente e fica reservado para polls sem novas linhas; status 11 entrega a última linha e encerra. A XP de batalha positiva é anunciada uma vez no canal INFO do chat, sem aviso central. Emails de capítulo usam remetente “Email do sistema”, assunto “Conclusão de campanha”/“Conclusão de campanha SsS” e corpo com o nome traduzido do capítulo. A migração de emails existentes altera somente esses três campos, preservando anexos, leitura e retiradas. Relatório: `reports/campanhas/recompensas-correcao.json`.

Correção de entrada heroica em 13/10/2026: o módulo da tela consulta `singleHeroCount` somente quando o campo existe no núcleo carregado. O núcleo atual não possui esse campo; o acesso direto interrompia o clique antes do opcode 5039. O backend continua validando as três tentativas e agora responde explicitamente à consulta 9536/1 com o contador 4948. O módulo foi recompilado, seu checksum publicado foi renovado e a sequência de combate/conclusão não foi alterada. Relatório: `reports/campanhas/entrada-heroi-correcao.json`.

O módulo carrega todas as 83 fases da campanha singleplayer tradicional desta versão (LandId=1, Types=0): 45 normais e 38 heroicas, nos capítulos 101 a 107. Requisitos de nível, predecessora, energia e conclusão normal para entrada heroica permanecem ativos. A inclusão do conteúdo não concede níveis ou conclusões às contas.

## Conteúdo e persistência

- `content.json`: primeiras 16 definições capturadas, com a Toca dos Lobos mantida como referência legada.
- `hero-content.json`: catálogo anterior dos cinco protótipos heroicos gerados pelas tabelas.
- `expanded-content.json`: referências da sessão de 13/10/2026 para esses cinco protótipos e 62 fases adicionais. O loader substitui os protótipos em suas posições originais.

`content.ts` preserva os índices antigos das campanhas e os 130 pisos de labirinto/abismo. As referências novas são anexadas somente após as referências existentes do labirinto, com índices explícitos 175 a 372. `CityWorld` chama `addCampaignBattles`, constrói `LabyrinthFeature` e então chama `addExpandedCampaignBattles`. Alterar essa ordem exige uma migração de saves; o helper rejeita um índice incompatível.

## Fluxo

A dinâmica foi preservada: entrada → combate atual → vitória → próximo pedestal → demais combates → relatório de conclusão → cartas após a animação → escolha e saída solicitada pelo cliente. Os índices dos pedestais são os originais de `SingleCampaignDatas`; algumas fases possuem três ou quatro encontros. Reconectar não cobra novamente nem revive os encontros vencidos. Derrota não conclui o encontro. A entrada sem energia segue a exceção já existente: registra a conclusão, mas não concede XP, drops ou cartas.

## Recompensas

Nas 67 definições importadas, XP de encontro usa `SingleCampaignDatas.HeroGp`, e XP de conclusão usa `Campaigns.BaseGp`. A conta online estava no nível 80, com bônus ou XP zerada em diversas fases; esses estados temporários não são aplicados à conta local. O relatório enviado utiliza a XP de conclusão da fase. As 16 definições antigas permanecem intactas.

Espírito e ouro de combate usam valores observados, com crédito no ledger central. Drops diretos são compilados das diferenças de quantidade entre atualizações de inventário, antes do relatório e da escolha de carta, e depositados pela função central de inventário. Apenas itens do catálogo de recompensas da fase são importados. Não se copia a quantidade total de uma pilha online. O bot também inclui esses drops.

Cartas usam os IDs de `Campaigns.Item`, com quantidades observadas quando disponíveis e as referências anteriores para itens comuns. Quando a quantidade não foi capturada, é utilizada uma unidade; não se afirma que essa quantidade é original. Os pesos continuam uniformes porque as probabilidades do servidor original não foram recuperadas. Uma escolha gratuita permanece persistida e idempotente. Prêmios normal/SsS do capítulo inteiro continuam sendo enviados uma única vez por email.

## Combate e limites

Preparações, atores, posições, habilidades e ações de referência vêm da captura. Ataque e defesa vêm das tabelas originais, incluindo a normalização dos campos `Defense`/`MagicDefense` dos chefes nas fases importadas. Classe, nível, aparência, habilidades aprendidas e tropas do jogador vêm da conta local; dados da conta online de nível 80 não são concedidos.

O motor de combate existente continua em uso. Fórmula de dano, crítico, condições completas da IA, buffs e invocações ainda não reproduzem integralmente o servidor original. As capturas de poucos turnos não exercitam todas as variantes da IA. Esta expansão fornece todas as fases e o fluxo de jogo, sem declarar essas fórmulas completamente recuperadas.

## Recursos e reprodução

`scripts/import-all-campaigns.mjs` compila somente fontes preservadas no backend e mantém o catálogo estável. `scripts/preserve-campaign-assets.mjs` verifica/baixa sprites, efeitos e cenários no cache do backend. Nenhum desses caminhos depende da pasta do cliente em runtime.

A conferência cobriu 275 caminhos: 260 já estavam íntegros e 14 foram baixados (1.852.883 bytes), incluindo `monster002C`, `buff_add_MDFup`, `dust_surround` e `monster028D_skill01_hit`. Resta `/cdn/skilleffect/physical009.swf`, recusado pelo upstream com 403, uma falha também observada na sessão online. Isso não é garantia de que todos os visuais cosméticos ou talentos encadeados estejam preservados. O modo local mantém cache first.

Relatórios: `reports/campanhas/expansao.json`, `recursos.json` e `fases.md`. Testes: `test/campaign-expansion.test.ts` e as regressões anteriores em `test/campaign-rules.test.ts`/`test/city.test.ts`.
