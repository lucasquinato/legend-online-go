# Correções da validação visual do casamento — 22/10/2026

## Pedido pendente

O cliente mantém `proposeDic` por alterações individuais. Um `EngageMsg` vazio não limpa o dicionário. A aceitação/recusa agora envia a entrada do remetente com `property1=false`. A aceitação também limpa os demais pedidos cancelados pelo compromisso, inclusive nos destinatários envolvidos. Snapshots enviam remoção explícita para o parceiro atual e para pedidos expirados. Repetir uma aceitação já confirmada retorna o estado atual sem consumir outro anel ou criar outro vínculo.

## Saída do salão

Os botões enviam 5025/5120; o guia da carruagem também usa 5025. O fluxo anterior apenas mudava o mapa no servidor e reutilizava uma resposta capturada incompleta. Agora a saída limpa a instância e envia os modelos atuais e `15 RoomExitRspMsg` com o ID real do jogador. É o pacote tratado por `RoomManager.__returnRoomHandler`, que chama a transição nativa para fora da sala. O portal do salão utiliza o mesmo encerramento. Sair preserva a cerimônia e permite retornar enquanto ela estiver aberta. Não exige encerrar os votos nem esperar as duas horas; a restrição de divórcio durante uma cerimônia ativa permanece separada.

Antes do reinício, as referências antigas `saved.wedding/location` das duas contas foram limpas para permitir login fora da cena presa. O vínculo, votos, materiais, upgrades e ações da recepção foram preservados; as demais contas não foram alteradas.

## Carruagem

O comando nativo `8759/op7` agora funciona no Reino do Céu. Exige os dois cônjuges no Reino, em equipe de dois, com o solicitante como líder e sem duelo. A modalidade precisa ter percurso cadastrado: as tabelas recuperadas fornecem Path para Amor de Mil Anos.

O servidor usa esse percurso e transmite `4672 MarriageProMsg` com identidades, nomes, ícones das classes e caminho. O cliente cria sua própria `MarryCarInfo/MarryCarAi/MarryCarView`. Jogadores presentes no Reino também recebem o passeio. O estado persiste, e o snapshot de entrada/reconexão fornece o trecho restante. O ponto final é sincronizado uma vez por jogador; nova solicitação durante o mesmo passeio não cria outro. A estimativa de tempo usa o movimento nativo de cinco pixels por frame e o padrão nominal de 25 fps do gerenciador. Não há custo extra inventado para o passeio.

Os três arquivos de avatar `marriage/10.bswf`, `11.bswf` e `00.bswf` foram obtidos/confirmados com HTTP 200 no cache local.

## Loja

Coração de Rosas (208034) e Selo de Juramento (208057) passaram a ser tratados na compra rápida e no carrinho, com a oferta e preço das tabelas. Coração de Rosas custa 2 diamantes; Selo de Juramento, 10. A compra usa a contabilidade central e a mochila, com reversão atômica se falhar.

O Coração de Rosas aumenta felicidade/perfeição. O material básico do anel é Coração Eterno (208036), cuja compra por 10 diamantes permanece disponível; o Cristal da Eternidade avançado mantém a oferta local de 50 diamantes definida anteriormente.

## Recepção e limites visuais

A cena anterior enviava somente dois NPCs. Agora também envia os objetos de bolo (8002), champanhe (8007), doces (8003) e saída (2336), usando os IDs e posições dos layouts recuperados. Os objetos da festa começam ocultos e as ações 102/108/107 enviam `128 CampaignNodeUpdateMsg` para ativá-los. As alterações chegam aos demais participantes e são restauradas ao reentrar. A inicialização usa 127 e as atualizações usam 128, sem repetir o carregamento 125.

Os três recursos originais da festa foram confirmados via HTTP 200. Flores e fogos permanecem com os estados/regras anteriores; a encenação original específica desses efeitos não foi reproduzida nesta correção. A existência dos objetos visuais não comprova uma reprodução completa da coreografia online.

## Validação e implantação

- Build TypeScript aprovado.
- 37 testes aprovados: social, residência, cerimônia, saída por botões/portal, estado antigo de localização, compras, tombstones dos pedidos, carruagem e persistência dos objetos da festa.
- AIR real aprovado para a remoção do pedido no modelo nativo, inicialização da carruagem nativa com percurso e classes corretas e leitura dos pacotes de saída/atualização visual. O teste precisou iniciar `EnterFrameManager.setup(stage)`, como faz o jogo, para a IA da carruagem funcionar. Isso corrige a preparação do teste, não altera o cliente de produção.
- Nenhum SWF de produção foi modificado. Os recursos originais foram preservados/obtidos no cache.
- Backup: `data/backups/before-wedding-exit-carriage-20261022.sqlite`; integridade `quick_check=ok`.
- Servidor local reiniciado, PID 3612, HTTP 8080, TCP 5004 e policy 843; `/healthz` confirma modo tutorial, cache-first e TCP ativo. Log de erro vazio após a subida.

A validação visual integral continua sendo feita no launcher. Fechar e reabrir limpa a cena antiga; os objetos já invocados aparecerão ao retornar ao salão. Para a carruagem, saiam do salão e iniciem o passeio no Reino do Céu com a equipe dos dois noivos.
