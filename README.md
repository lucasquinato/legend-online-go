# Legend Online Go

Projeto privado com backend Node.js/TypeScript, launcher Windows C# e cliente
Flash com patches auditados. Código e dependências fazem parte do repositório.
Não há contas ou progresso pré-carregados.

## Preparar uma instalação nova

Requer Node.js 24, npm, Git LFS, Java 21, Windows com .NET Framework 4.x e
PowerShell 7 com Roslyn. AIR e FFDec estão incluídos em vendor.

```powershell
git lfs install
git lfs pull
npm run setup
npm run build
npm run build:launcher
npm start
```

O setup instala pelo lock e reconstrói o cache a partir de vendor. Não cria
contas. Cadastre uma conta na tela do launcher:

```powershell
.\dist\launcher\LegendOnline.exe --server=http://127.0.0.1:18080
```

## Configuração

Todos os parâmetros estão comentados no `.env.example` da raiz. O projeto lê
`.env` se existir; caso contrário, lê `.env.example`. Variáveis já definidas no
processo têm prioridade. Não há mistura por variável entre os dois arquivos.
Para personalizar, copie `.env.example` para `.env`.

Por decisão do mantenedor, o exemplo do repositório PRIVADO inclui as chaves
de autenticação e assinatura de atualizações. A assinatura continua usando a
identidade pública dos launchers existentes. Não imprimir chaves em logs.

## Recriar do zero

Encerre o servidor e execute:

```powershell
npm run reset -- --yes
npm run setup
npm run build
npm run build:launcher
npm start
```

O reset apaga contas, progresso, cache e saídas geradas. Preserva vendor,
fontes e configuração. `.local` e `.artifacts` são dispensáveis. As dependências
versionáveis ficam em vendor, reference e nos insumos de reports; binários usam
Git LFS. Envie os objetos LFS ao remoto, não somente os ponteiros.

`npm run verify:independence` testa uma cópia limpa usando somente os candidatos
ao Git, sem banco, node_modules, builds ou pacotes privados externos.

Não executar formatters. Modas permanece protegida. Antes de editar SWFs,
leia `apps/server/scripts/swf/README.md`.

Os módulos executáveis indexados e o acervo coletado são locais. Assets ainda
não coletados seguem o fallback configurado: local, remake e OAS.

Antes de publicar o repositório, retirar segredos também do histórico Git.
Apagar apenas as linhas atuais não remove versões anteriores. Uma troca da
identidade de assinatura exige planejar a migração dos launchers distribuídos.
