# Correção do carregamento em 73% / 95%

O cabeçalho de /xml/tempinfos.xml conservava o tamanho comprimido do recurso original (3.308.274 bytes), embora a resposta local já tivesse 3.379.933 bytes de conteúdo comprimido. A diferença de 71.659 bytes ultrapassava a tolerância de 3.000 bytes de BaseLoaderII.__onDataLoadComplete. O cliente repetia a requisição e terminava em falha de carregamento, registrada no launcher por BaseLoaderII/onLoadError.

As cinco transformações locais agora usam encodeClientTableBundle, que comprime os dados primeiro e grava o tamanho exato do payload no cabeçalho externo. A versão interna e as definições das tabelas permanecem preservadas. Nenhum SWF de produção foi alterado.

Validação: TypeScript check/build; 60 testes aprovados; resposta HTTP com tamanho declarado 3.379.933 e tamanho real 3.379.933; carregador original BaseLoaderII no AIR aceitou o arquivo e o parser XML do AIR validou as 292 tabelas (62.259.294 bytes descomprimidos).

Servidor local ativo nas portas 8080/5004/843, modo tutorial, recursos cache-first. Foi feito backup completo em data/backups/loading-header-2026-10-16T03-09-17.158Z. As sessões voltaram a gerar ações de gameplay após o reinício; a identidade das contas foi conferida e não houve reset solicitado ou executado.

Detalhes em verification.json, native-loader.json e account-check.json.
