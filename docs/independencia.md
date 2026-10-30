# Instalação independente e descartável

A fonte da instalação é o repositório privado completo, incluindo Git LFS.
Não há um pacote obrigatório escondido em .local ou .artifacts.

Dependências estáticas ficam em vendor e nos insumos reference/reports.
Contas e progresso ficam somente no banco gerado em DATA_DIR, cujo padrão é
apps/server/data. Apagá-lo elimina contas e cache. Setup reconstrói o cache
com arquivos versionados, sem recuperar contas antigas.

`npm run verify:independence` cria uma cópia temporária somente com candidatos
ao Git, sem node_modules, data, builds, .local ou .artifacts. Instala, compila,
testa e serve offline todos os módulos indexados. O resultado descartável é
gerado em `.local/validation/independence.json`.

O cliente Flash continua baseado em binários recuperados e patches auditados;
não equivale ao projeto original inteiro recompilável no Adobe Flash.
