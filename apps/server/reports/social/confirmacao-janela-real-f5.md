# Confirmação matrimonial: janela real e proteção ao F5

## Estado verificado
Na verificação e no backup desta entrega, as contas pirata_teste (1826) e pirata_teste_2 (1827) continuavam registradas como noivas, status 1. A confirmação da cerimônia não havia sido aceita: pendingQuality=1, payer=1826, payType=1, quality=0, phase=0. Não foi aplicado aceite, recusa, cobrança ou anel manualmente.

## Causa que impedia a janela
O teste anterior substituía os controles gráficos e não executava o construtor completo com os estilos reais. Ao executar esse construtor no AIR, a versão publicada reproduziu TypeError #1009 em ComponentFactory.getComponentStyle → MarryConfirmFrame.initView: o código requisita MarryConfirmFrame.PayTypeTxt, inexistente no pacote original de estilos d0a3cb68.

O método initView agora usa o estilo existente MarryConfirmFrame.rewardTxt1 para esse campo e define sua posição abaixo das recompensas (x=30, y=285, largura=410, altura=20). A informação de pagamento original continua sendo preenchida pelo refreshView.

A prévia nativa do anel também requisitava asset.core.ringUpBack1, ausente nos recursos recuperados, enquanto asset.core.ringUpBack existe. A ponte registra uma definição ScaleFrameImage com os quatro estados usando esse bitmap real. Essa definição é instalada uma única vez pelo ComponentModel, antes de construir a janela. Nenhuma classe de recurso original foi substituída.

Foi acrescentado somente MarryConfirmFrame.initView ao contrato de métodos originais alteráveis. A ponte isolada ganhou ensureConfirmStyles. Construtores, demais classes e recursos permanecem protegidos; Modas não foi alterada.

## F5 e retomada
O launcher trata F5 como reconexão: Resume autentica a sessão e Play encerra o motor anterior antes de iniciar outro. A pendência matrimonial fica no SQLite, não na memória da janela. A recarga não representa um aceite nem uma recusa.

O servidor agora também reinicia a marca de apresentação ao começar um novo bootstrap de cena. Assim, mesmo uma recarga que reutilize a instância CityWorld pode reapresentar a pendência após 5017/8516. Atualizações sociais genéricas não ficam substituindo a janela em sequência.

O aceite continua sendo transacional e exclusivo do parceiro esperado. A operação repetida de um aceite já confirmado retorna o estado atual, sem cobrar novamente. A decisão explícita é registrada em tutorial_events, kind=marriage-consent, com conta, qualidade, pagante e aceite/recusa; não registra credenciais nem texto do pedido.

## Validação
- Novo test-wedding-full-window.mjs: baseline reproduz o estilo ausente; candidata abre as três qualidades e reabre a primeira usando ComponentFactory, controles, construtores, estilos e bibliotecas gráficas reais. Verifica presença no display, visibilidade e dimensões.
- Nesse teste, somente dados externos de configuração/tabelas/caminhos e tradução têm fixtures. Os métodos de janela e os controles visuais não são substituídos. As imagens dinâmicas externas não são uma validação visual completa do launcher.
- 20/20 testes sociais: preservação após reconexão, nova apresentação após bootstrap, ausência de apresentação repetida por atualização social, confirmação exclusiva do parceiro e ausência de cobrança repetida, além do ciclo até votos/anel.
- 17/17 contratos SWF, auditoria de todos os destinos de salto, gates anteriores de anel/felicidade, salões, aceites/recusas e carregamento junto com core/habilidades/modas/loja aprovados. TypeScript compilado. Sem formatter.
- O backend exige o novo gate e seu hash antes de servir o módulo. Builds sociais futuros executam esse cenário com estilos reais.

## Publicação
Servidor local tutorial/cache-first reiniciado, PID 26432, portas 8080/5004/843. HTTP e índice conferidos: módulo 9 SHA-256 4c789acb95d92616b5908f56608fd4d25ebdc4227f13f21361520ee4ce00094f, 331035 bytes, token 6f2848e9.
Backup: data/backups/pre-wedding-full-window-1792565152411.sqlite, quick_check=ok. A pendência original foi preservada.

Evidências: reference/social/local-ui/manifest.json (fullWindowRuntime), reports/social/wedding-full-window-backup.json, wedding-full-window-http.json, data/wedding-full-window-build.log, wedding-full-window-social.log e wedding-full-window-contract.log. O fixture negativo é reports/social/pre-full-window-9.swf; não é base de edição.
