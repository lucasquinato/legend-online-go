# Correção da lista de salões de casamento

## Origem comprovada
`data/city/scenario.json` preservava no pacote inicial 4662 oito salões premium do servidor online, todos marcados como ativos. Não eram cerimônias do banco local. O bootstrap não filtrava esse pacote, e `MarryModel.updateRoomDic` processa atualizações por casal, sem apagar todos os registros anteriores ao receber uma lista vazia. Assim, os oito casais antigos permaneciam no modelo e no contador de salões premium.

A janela original tinha uma segunda falha de apresentação: criava quatro cartões sem chamar o setter info=null. Os controles permaneciam com sua aparência inicial. `refreshView` também não limpava cartões remanescentes quando a lista diminuía.

## Correção no servidor
- Inicialização deixa de reenviar o modelo/listas matrimoniais capturados, incluindo 4662.
- Qualquer pacote 4662 capturado que atravesse o serializador da cidade é substituído pelo registro matrimonial atual do servidor. A correção cobre respostas reaproveitadas além do login.
- A consulta nativa 8759/10 retorna somente o registro local, sem duplicar a linha do próprio casal por snapshot secundário.
- Somente status 1/3 com salão criado e dentro do prazo são marcados ativos. Registros encerrados/expirados são enviados como remoções nativas, nunca como cerimônias disponíveis.
- O número do quarto é o ID persistente do casamento; não varia conforme o número de personagens presentes.
- Capturas foram preservadas como evidência; o conteúdo histórico não é apresentado como estado local.

## Correção da janela
`WeddingRoomsPatch.java` altera exclusivamente `MarryRoomListFrame.initItem` e `refreshView`, no módulo 9 da versão fixa. Inicializa os cartões com info=null e limpa todos antes de aplicar a lista recebida. Mantém a apresentação nativa vazia e o comportamento original de entrada, senha, ordenação e botão do próprio salão. Não altera classes ou recursos de Modas, nem os construtores de produção.

O build reproduzível está em `scripts/swf/fix-wedding-rooms.mjs`; a mesma alteração integra `build-social-ui.mjs`. A auditoria de diferença exige exatamente os dois métodos, e outra auditoria compara o conjunto completo ao baseline fixado. O helper SocialMarriageBridge permanece byte a byte igual.

## Validação
- O teste do backend inclui login com cenário capturado, consulta vazia, tentativa de replay de salão estrangeiro, criação de uma cerimônia local e expiração. Nenhum casal da captura aparece como ativo.
- AIR: baseline reproduz cartões antigos; candidato passa vazio → seis salões → um salão → vazio. O teste usa cópias com dependências gráficas simplificadas para verificar as atribuições dos métodos reais; a conferência visual final continua sendo feita pelo launcher.
- Gate social anterior passou para equipe/privado, proposta e inicialização do anel.
- Candidato real carregou com core, Habilidades, Modas e Loja; protocolo/modelo matrimonial nativo passou.
- Relatório do AIR e delta de bytecode: `reports/social/wedding-rooms-runtime.json`.

## Estado das contas
Não houve reset, consumo de moedas ou conclusão automática de cerimônia. Na verificação inicial havia apenas noivado entre 1826/1827, qualidade 1 pendente e nenhum salão criado. Após a correção, a lista deve mostrar os espaços vazios até o parceiro confirmar e o servidor criar o salão. É necessário fechar e reabrir ambos os launchers para descartar o modelo antigo em memória e carregar o módulo atualizado.


Validação final: regressão ampliada com 100 testes, 98 aprovados. Os dois testes de forja/correio que falharam foram reproduzidos sem as alterações de salões e são preexistentes; detalhes em `data/wedding-room-preexisting-check.log`. Os 18 testes sociais, incluindo a nova regressão de salões, passaram. Os 17 testes de contrato SWF passaram, assim como build TypeScript e gates AIR. O servidor foi reiniciado em tutorial/cache-first, HTTP 8080, TCP 5004 e policy 843. O hash e o tamanho do módulo 9 servido por HTTP conferem com o candidato auditado. O backup consistente passou no quick_check e preserva o noivado e a confirmação pendente. Caminho do backup em `reports/social/wedding-room-backup.json`.
