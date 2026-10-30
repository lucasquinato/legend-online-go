# Compra de materiais matrimoniais — 23/10/2026

As tentativas registradas em `city-request` usavam 8970, destinatário de protocolo 1810, oferta 11003 (Coração de Rosas) e quantidades 1, 3.111 e 9.999. A oferta 11003 tem `GiftToken="0"` e `Point="2"`.

Foram corrigidas três falhas:

1. `GiftToken || Point` era avaliado antes da conversão numérica. O texto "0" é verdadeiro em JavaScript, então ofertas com preço somente em diamantes eram tratadas como custo zero e rejeitadas. A conversão agora ocorre antes da escolha do preço.
2. A quantidade máxima era 999, enquanto a janela nativa BuyFrameI permite 9.999. O servidor passou a respeitar esse limite.
3. O carrinho recebia 4783/result=0 mesmo no sucesso. Agora recebe result=1 no sucesso e result=0 na falha; a compra rápida continua recebendo também 90/buyInfo.result. As atualizações de mochila/saldo precedem o callback.

Ofertas que aceitam apenas diamantes não consomem vinculados. Falhas de compra registram o motivo e a oferta em `city-rejected`, sem expor credenciais. A operação continua atômica e utiliza contabilidade central e mochila.

Cinco testes direcionados aprovados, incluindo reprodução dos carrinhos capturados de 3.111 e 9.999 unidades, compra avançada de 9.999 cristais, rejeição de 10.000, callbacks, moeda correta e reversão. Build TypeScript aprovado. Nenhum SWF foi alterado.

Backup SQLite consistente: `data/backups/before-marriage-shop-20261023.sqlite`, quick_check=ok. Servidor local reiniciado, PID 6568. Nenhuma conta, saldo, casamento ou progresso foi resetado; os testes utilizaram bancos isolados.
