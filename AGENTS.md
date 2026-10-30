# Legend Online Go

Não executar Prettier ou outro formatter. Preservar o comportamento de Modas.
As regras adicionais de `apps/server/AGENTS.md` continuam aplicáveis.
Antes de alterar SWFs, ler `apps/server/scripts/swf/README.md`.
Usar o release-lock atual; preservar classes e recursos fora do escopo.
Auditoria de bytecode e teste no AIR são obrigatórios antes de publicar SWFs.
Não versionar contas, tickets, bancos ou progresso de jogadores.
Por autorização explícita do mantenedor, o .env.example da raiz contém as
chaves privadas deste repositório PRIVADO. Não imprimir seus valores em logs.
Binários e modelos indispensáveis ficam em vendor e Git LFS; o lock registra
seus caminhos, tamanhos e hashes. .local e data são sempre descartáveis.
Nenhum comando normal de desenvolvimento deve consultar a instalação antiga.
