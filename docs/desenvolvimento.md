# Desenvolvimento

A configuração única fica na raiz: `.env`, com fallback de arquivo para
`.env.example`. Os parâmetros e as duas chaves estão documentados no exemplo.
Não registrar valores das chaves em logs, erros ou relatórios.

`npm run setup` prepara uma instalação sem contas somente com o repositório.
Não consulta a instalação antiga, `.artifacts` ou backups privados externos.

`vendor/static-assets` contém objetos e índice do acervo coletado.
`vendor/server-seed` contém modelos estruturais de protocolo necessários ao
motor, não um banco de contas. `vendor/test-fixtures` contém fixtures mínimos
de regressão; não instala jogadores. AIR fica em `vendor/air-runtime` e FFDec
em `vendor/ffdec`.

Esses arquivos entram no repositório privado, com Git LFS para binários.
`docs/artifacts.lock.json` registra sua integridade. `npm run artifacts:verify`
verifica os objetos reais; ponteiros LFS sem download não passam na verificação.

Depois de coletar assets novos, execute `npm run assets:export -- apps/server/data`
e `node tools/artifacts.mjs index` para preservá-los em vendor e atualizar o
lock. O exportador seleciona somente assets; não copia contas nem progresso.

`npm run reset -- --yes` remove contas, progresso, cache e saídas geradas.
Executar com o servidor encerrado e depois executar setup e build.

A suíte geral possui seis falhas anteriores à reorganização, documentadas em
validacao.md. Não foram escondidas nem houve alteração de gameplay para fazer
os testes passarem. Os testes não devem depender do .env do operador.
