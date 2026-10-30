# Coletor de recursos de montarias — Remake

Execute na raiz de `wartune_server`:

```powershell
node scripts/collect-mount-assets.mjs --concurrency=2
```

O jogo pode continuar no modo local. Não é necessário abrir o launcher online ou fazer login.

O coletor usa a origem de `UPSTREAM_ORIGIN` (padrão `https://servidor.legendremake.com`), as tabelas de montarias e o `res_md5.dat` já preservado no cache do cliente. O plano contém previews, animações BSWF do mapa, ícones das cartas e caminhos adicionais de personagens montados observados nas requisições do cliente.

Os nomes com sufixos de versão são derivados do índice. Recursos compartilhados por mais de uma montaria são baixados apenas uma vez. O preview do Koala é registrado como falha conhecida e ignorado; sua animação e seu ícone não são excluídos da verificação.

Antes de baixar, os objetos existentes são verificados por tamanho, SHA-256, tamanho esperado no índice e formato quando aplicável. Respostas vazias/HTML, arquivos truncados, PNGs inválidos e SWFs que não descomprimem corretamente são recusados. O BSWF é preservado como binário e comparado com o tamanho do índice quando disponível; isso não equivale a uma confirmação visual no AIR.

Arquivos válidos entram em `data/assets/objects/<sha256>.bin` e na tabela `assets` de `data/state.sqlite`, com a mesma chave de URL usada pelo servidor. Escrita do arquivo por temporário/rename e atualização individual no SQLite. Contas, progresso, gameplay e módulos SWF locais não são modificados. Arquivos já válidos não são sobrescritos.

Relatório incremental e final: `reports/montarias/collector-latest.json`, com o resultado individual e os motivos das pendências. Reexecutar retoma o trabalho pelo cache, sem baixar novamente arquivos válidos. Só erros de rede/HTTP 5xx recebem uma segunda tentativa durante a execução; HTTP 403/404 e arquivos vazios não entram em repetição contínua.

Opções:

```powershell
# Conferir o plano sem fazer downloads ou alterar registros do cache:
node scripts/collect-mount-assets.mjs --plan

# Fazer uma amostra de até dez downloads:
node scripts/collect-mount-assets.mjs --limit=10

# Restringir a montarias específicas, pelo ID da tabela:
node scripts/collect-mount-assets.mjs --mounts=8013,8482

# Usar apenas uma transferência para diminuir disputa pela conexão:
node scripts/collect-mount-assets.mjs --concurrency=1
```

Um HTTP 200 não garante asset válido. A Besta Devoradora, por exemplo, pode continuar pendente se a origem entregar zero bytes. Não são inventados arquivos nem utilizados módulos de outra versão para preencher lacunas.
