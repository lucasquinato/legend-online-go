# Reino do Céu

O automático individual de duelo está integrado pelo comando nativo 10020 e
resposta 77. Ao ativar, a IA tática avalia habilidades equipadas/runas no mesmo
motor dos jogadores; ao selecionar manualmente, o jogador retoma o controle.
Sem ativação, permanece o ataque básico de ausência de escolha. A conexão,
convite/aceite e carregamento de ambos continuam necessários. Detalhes em
`reports/batalhas/ia-tatica.md`.

Área compartilhada do mapa 10000 com duelos consentidos entre jogadores. Portais, NPCs e suas atividades internas permanecem inertes.

- `map.ts`: limites, grade original, validação de segmentos e retorno a solo válido.
- `index.ts`: entrada/saída, posição persistente, permissões de voo e inspeção pública.
- `hub.ts`: presença exclusivamente em memória, eventos entre sessões e remoção ao desconectar.
- `protocol.ts`: projeção dos schemas públicos e codificação de identidades locais sem personalização de capturas.
- `duels.ts`: convite/aceite, simulação compartilhada, habilidades dos dois jogadores e resultado sem recompensas.
- `../social/inspection.ts`: perfil, atributos e equipamentos públicos, consultáveis também pelo chat fora do Reino e offline.

O `CityWorld` mantém o progresso e as transações. O `GameServer` remove a presença no fechamento da conexão. O `GlobalChat` atende o canal Atual e o protocolo privado nativo apenas entre participantes conectados do Reino. Amizades reutilizam `SocialFeature`.

A grade em `reference/sky-realm/map.json` é extraída por `node scripts/extract-sky-realm.mjs` do arquivo original `10000_044b2a4c.titles`, conferido por SHA-256. A regra terrestre é a do `FindPath8`: célula com valor verdadeiro permite passagem. Voar ignora obstáculos, preservando os limites 450 × 300 células, de 20 pixels. O nascimento 175,98 vem do nó original de tipo 40.

A posição persistida é o destino do último trajeto aceito; a animação e sua velocidade ficam com o cliente original. A última rota permite mudar o destino enquanto o personagem ainda a percorre. A rota aceita é enviada apenas aos outros jogadores: SpaceWalkLayer concatena os trajetos recebidos e devolver a rota ao autor fazia seu personagem voltar ao início. Isto não é uma simulação de física/tempo de chegada do servidor e não deve ser usado para validar ações futuras que dependam de distância. Os duelos são convites entre participantes do mesmo Reino, sem requisito de proximidade.

O fluxo nativo 9547/4421 oferece aceitar/recusar por 10 segundos. O duelo usa BattleType.USER_DEFINE_BATTLE (14), MapInfo 10000/BattleGround 12, e espera o carregamento dos dois participantes. Cada lado recebe seu próprio `side`, habilidades e recargas. Uma única instância do motor resolve ambos os jogadores, tropas, efeitos e atributos atuais, sem passar pelo personalizador de capturas. Apenas o ator pertencente à conexão pode receber uma escolha manual. Na ausência de escolha ambos usam seu ataque básico automático. Um cliente não pode pausar a simulação do adversário. Resultado e pacotes atrasados ficam associados ao ID do duelo para não interferirem na batalha seguinte.

Preparações construídas no servidor devem passar por `createAdventure`, que completa os campos nativos ausentes dos heróis. Em particular, `hp2` precisa ser enviado como Int64 zero quando não há vida secundária: o leitor Flash acessa esse objeto sem verificar null. Um teste TCP com callback simulado não detecta essa incompatibilidade. O probe separado `scripts/swf/DuelPrepareProbe.as` reproduz a falha e valida os pacotes corrigidos no AIR, sem modificar os SWFs do jogo.

O primeiro personagem derrotado encerra o duelo, mesmo com tropas sobreviventes. Não há XP, drops, consumo de energia, perda de tropas ou modificação do cache de fúria de campanha/labirinto. A vida e fúria de combate existem somente no snapshot. Desconectar concede a vitória ao oponente; reiniciar cancela os duelos voláteis. Há cancelamento de carregamento após 30 segundos e limite total de 10 minutos. O cliente retorna ao Reino usando sua própria tela de resultado e mantém a posição salva. Os comandos 8200/4128, 15038/4256 e 8199/4125 são atendidos com os dados locais, sem expor itens da mochila.

Os eventos de presença são emitidos somente depois do save; rollback não anuncia entrada ou movimento. A presença não é persistida: reiniciar limpa a lista de conectados, preservando a posição para o próximo login. As filas de movimento e aparência substituem atualizações pendentes anteriores do mesmo personagem.

Testes: `test/sky-realm.test.ts` e `test/sky-realm-tcp.test.ts`. Relatório: `reports/reino-do-ceu/implementacao.md`.
