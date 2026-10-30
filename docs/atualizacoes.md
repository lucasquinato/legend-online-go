# Compilação e atualizações

## Launcher, engine e AIR

```powershell
pwsh -NoProfile -File tools/build/launcher.ps1 -Version 0.1.5
node tools/release/launcher.mjs 0.1.5
```

O compilador usa os fontes C#, preserva o runtime e produz `LegendOnline.exe`,
`LegendOnline.Updater.exe` e a identificação de versão. Usa apenas a chave
pública; não gera nem exige uma chave privada. A chave privada é lida de
`RELEASE_SIGNING_PRIVATE_KEY_BASE64` no ambiente da raiz; a pública é fixada em
`client/manifests/update-public.xml` e embutida nos dois executáveis.
Não regenerar a identidade após distribuir um launcher. Caso a chave privada
seja perdida, restaure o backup; o script se recusa a gerar outra chave quando
a identidade pública já está fixada.
Somente o publicador exige essa chave e verifica sua correspondência com a
identidade pública antes de preparar arquivos da distribuição.

O publicador cria uma pasta imutável por versão em
`apps/server/releases/launcher/files/` e só depois troca `stable.json`.
O servidor entrega o manifesto em `/updates/launcher/stable.json`.
O manifesto possui payload assinado RSA/SHA-256 e lista de hashes/tamanhos.
Somente HTTPS é aceito fora de loopback; redirecionamentos são recusados.

Ao abrir, o launcher verifica uma versão superior em segundo plano. A recusa
da atualização ou a indisponibilidade do endpoint permite continuar. Se o
jogador aceitar, o launcher fecha e um updater copiado para uma pasta
temporária valida o pacote, aguarda o processo pai e aplica a substituição.
As contas e preferências em LocalAppData não são incluídas nem apagadas.

Antes da troca, arquivos anteriores são copiados para `.update/backup-*` na
instalação. Um journal gravado atomicamente permite desfazer uma troca
interrompida. No próximo início, o launcher inicia a recuperação antes da UI.
Backups são preservados; não há política automática de retenção ainda.
O updater recusa downgrade/reaplicação pela versão do executável instalado.

O ensaio nativo é reproduzível com `node tools/test/updater-native.mjs`. Ele
usa um servidor HTTP temporário, instalação fictícia e a versão do package.json,
sem alterar o canal publicado ou abrir uma sessão do jogo.

## Módulos Flash

Os patches continuam usando a base fixada, auditoria e AIR. Exemplos:

```powershell
cd apps/server
node scripts/swf/build-chat-ui.mjs
node scripts/build-formation-ui.mjs
npm run test:swf-contract
npm run test:mount-ui
```

Depois dos gates, com o servidor em canal `live`:

```powershell
node tools/release/client.mjs 0.1.0 http://127.0.0.1:18080 --publish
```

O snapshot busca os bytes realmente servidos pelo backend, inclusive os
índices alterados. Se faltar um módulo, a publicação falha; nenhum ponteiro
ativo é alterado. A pasta `.staging` preserva o diagnóstico, não é uma release.

Com publicação completa, defina `CLIENT_RELEASE_CHANNEL=stable` e reinicie.
O servidor verifica os arquivos por SHA-256, serve os índices da versão ativa
sem cache e mantém disponíveis os módulos com tokens de versões anteriores.
O canal `live` continua voltado ao desenvolvimento. O acervo de imagens,
animações e sons permanece separado, usando o cache e fallback existentes.

Para voltar a uma versão Flash, selecione uma versão já publicada no ponteiro
`apps/server/releases/client/stable.json` e reinicie. Não sobrescrever conteúdo
sob o mesmo token. Novos módulos entram em uma nova sessão do cliente; não há
hot swap de classes ActionScript dentro de uma sessão já carregada.

O campo `protocol:1` destes manifestos identifica o formato desta distribuição;
não implementa negociação completa de versões do protocolo de jogo.
Um instalador público, assinatura Authenticode e hospedagem HTTPS de produção
não foram publicados. O fluxo entregue é local e não implica deploy.
