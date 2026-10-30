# Validação do projeto novo — 29/10/2026

## Estado inicial

O banco foi recriado sem usuários, personagens, progresso ou amizades. O cache
foi reconstruído com 11.042 entradas de assets. Nenhuma conta antiga é instalada
pelo setup. A instalação original fora do monorepo permanece intacta.

`.artifacts` deixou de ser uma dependência. Os insumos ficam em vendor e
reference/reports, disponíveis ao Git, com Git LFS para binários. A verificação
dos 11.141 arquivos do lock passou por SHA-256. Seus caminhos foram conferidos
contra as regras de ignore do Git.

## Configuração

O .env.example da raiz contém parâmetros comentados e as chaves de autenticação
e assinatura. A autenticação recebeu uma chave nova para a instalação zerada.
A assinatura preserva a identidade pública dos launchers já compilados.

Os testes cobrem preferência pelo .env, fallback para .env.example,
substituição integral do arquivo e prioridade das variáveis do processo,
nas ferramentas e no backend iniciado dentro de apps/server. O endpoint do
cliente foi comparado com a pública derivada da chave configurada, sem imprimir
os segredos.

## Verificações

- TypeScript: check e build passaram.
- Launcher e updater: compilação passou com vendor/air-runtime.
- Ferramentas: seis testes passaram, incluindo dois de configuração.
- Capturador e fallback: dez testes passaram.
- Updater nativo: atualização assinada, recuperação e rejeição de manifesto
  adulterado passaram com a chave fornecida pelo ambiente.
- npm run verify:independence usa somente os candidatos ao Git, sem pacote
  privado externo, banco, cache, node_modules, builds, .local ou .artifacts.
  Seu relatório fica em .local/validation/independence.json.

## Pendências anteriores

A suíte geral anterior teve 805 testes: 799 aprovados e seis falhas também
reproduzidas na instalação antiga, sem relação com esta reorganização:

1. city.test.ts: expectativa antiga de forja não implementada.
2. city.test.ts: anexos, modas e atributos em outra ordem.
3. cosmos-availability.test.ts: formato esperado do catálogo.
4. messaging.test.ts: expectativa antiga da mensagem de forja.
5. server.test.ts: atendimento de versão histórica do módulo da campanha.
6. sqlite-contention.test.ts: pacote do timer durante bloqueio do SQLite.

Essas falhas não foram omitidas nem houve alteração de gameplay para contorná-las.

## Limites

A independência das pastas descartáveis não representa coleta de todos os
visuais. Os 17 módulos indexados e o acervo coletado estão preservados; outros
recursos continuam usando o fallback configurável. Testes AIR não substituem
um percurso visual de cada funcionalidade.

O primeiro commit é local. O envio ao remoto deve incluir os objetos Git LFS.
O .env.example é deliberadamente privado e requer tratamento também no histórico
antes de uma publicação do repositório.

A última reconstrução limpa passou em 13 verificações, usando 11843 arquivos candidatos ao Git, zero contas e 17 módulos servidos offline, sem pacote externo.
