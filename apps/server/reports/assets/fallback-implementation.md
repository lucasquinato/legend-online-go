# Recuperação automática de assets

Modo ativo: cache-first. Ordem: cache local verificado por SHA-256, remake, OAS HTTPS e transporte OAS HTTP como última alternativa. Cada tentativa remota tem limite de 15 segundos (ou o timeout configurado, se menor). Downloads completos são gravados atomicamente no acervo e associados ao endereço originalmente pedido pelo cliente. asset_sources registra a origem efetiva.

O índice OAS local fornece 51.640 versões para mapear os sufixos específicos daquela distribuição. As áreas visuais incluem monstros, avatares, equipamentos, mapas, efeitos, interfaces e imagens. Módulos executáveis em /client e tabelas em /xml continuam presos à versão do remake; não se misturam versões do aplicativo. Overrides locais existentes continuam prioritários.

Respostas HTTP inválidas, páginas HTML, arquivos vazios e transferências incompletas não entram no cache. Falta ou corrupção local tenta novamente as origens. Offline explícito continua sem rede. O modo online explícito continua forçando atualização. A recuperação depende da disponibilidade do arquivo nos servidores externos.

Validação: build TypeScript, cinco testes do fallback e regressão do acervo offline. Servidor local reiniciado e healthz confirmado. Fazendas de pirata_teste, pirata_teste_2 e pirata_teste_3 elevadas para 80, com XP acumulado consistente. Cultivos, solo e árvore preservados; slots seguem o desbloqueio normal no próximo acesso. Backup e detalhes: farms-level80.json.
