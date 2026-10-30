# Andrew — correção de desconexão

O log registrou duas ocorrências de `world-session-error: Pacote do reino sem schema: 4656`.

A lista de propostas vazia gera um protobuf válido com corpo de zero bytes. A string base64 é vazia, mas `skyWire` usava a veracidade da string para decidir se havia pacote autoritativo. Isso fazia o pacote cair na resolução de schemas do Reino e lançar exceção, encerrando a sessão. O mesmo teste incorreto existia no serializador geral da cidade.

Correção: ambos os serializadores reconhecem a presença de `body` mesmo quando é vazio. A reprodução também revelou que o aviso de Andrew utiliza 111 (alerta de chat), ausente no mapa de schemas do Reino; seu schema nativo ChatChannelMsg foi adicionado.

Teste de regressão reproduziu o erro 4656 antes da correção. Depois, visita duas vezes o Andrew com noivado, nenhuma proposta pendente e personagem no alcance do NPC, confere o corpo vazio válido, parceiro/estado, aviso 111 e consulta subsequente do personagem. A sessão continua respondendo.

Validação: 32 testes aprovados em social, Reino do Céu e sessões TCP autenticadas; build TypeScript aprovado. Servidor reiniciado em tutorial/cache-first, HTTP 8080 e TCP 5004. Nenhuma conta foi resetada e nenhum SWF foi alterado. Log original preservado em andrew-disconnect-before-fix.log.


## Diálogo do NPC e confirmação pendente
A visita ao Andrew também precisava retornar 4601/PropertyMsg.param1=22. No cliente fixado, SpaceSocketManager.__spaceEventHandler lê esse pacote, dispara SELECT_NODE e SpaceSceneController abre SpaceDialogFrame. A resposta anterior apenas enviava dados e orientação textual. A visita agora envia o gatilho nativo após atualizar os dados; removeu-se o aviso modal redundante. A visita a alvos de missão matrimonial também recebe o gatilho do diálogo.

O teste de visita repetida verifica o gatilho 4601 com nó 22 e a ausência de aviso 111 no clique. As 32 verificações sociais/Reino/TCP passaram. Outra verificação identificou qualidade 1 pendente para o casal 1826/1827, com pagante 1826. Snapshot passou a reenviar a confirmação 4658 apenas ao parceiro, sem novo débito. Os 16 testes sociais passaram novamente, incluindo retomada da confirmação e rollback do pagamento dividido. Build aprovado e servidor local reiniciado.
