# Sala de casamento, residência e materiais do anel

## Correções

- A presença própria e dos visitantes em `RoomEnterMsg` agora inclui `online_state=1` na residência (5601) e nos três salões (4301/4302/4303). O cliente executa `CampaignArmyView.updateVisible(): visible = data.online`; antes o campo omitido tornava o personagem invisível. A mesma presença era consultada pelo diálogo de votos para conferir os dois noivos online.
- Andrew e Recepção tinham `camp_data_id` igual ao mapa. `CampaignManager.readNodeInfo` usa esse campo como identificador do nó, e o diálogo procura por ele; os dois NPCs colidiam. Agora os identificadores são 3 e 8, respectivamente, em sintonia com as respostas.
- O salão passa a tratar a chegada ao NPC (`5125 CampaignReqMsg.para_int1`) e responde `29 CampaignConfirmMsg`, tipo 11 para Andrew e 12 para Recepção. Valida a existência do NPC e distância de até seis células. O cliente abre a própria `MarryWeddingDialogFrame`, com as opções do estágio matrimonial real.
- O callback genérico 5033 é encerrado no salão para evitar cair em respostas capturadas de outra instância. O 5038 continua sem repetir 125 e sem reiniciar o carregamento.
- O ciclo validado inclui os votos explícitos dos dois noivos, entrega única das recompensas, bolo, champanhe, flores de cada noivo, doces, presentes dos convidados e compra de fogos. Os estados são persistidos e compartilhados com os participantes; esta correção não recria todas as animações cinematográficas do servidor original.

## Compras

A compra rápida 5154 e o carrinho 8970 usam a contabilidade central de moedas e a mochila. Uma falha de saldo ou espaço reverte a compra inteira. A entrega agora usa o item da oferta, em vez de sempre entregar o anel de proposta.

| Item | Compra na loja |
| --- | --- |
| Anel de proposta 208033 | 199 diamantes; oferta original preservada |
| Material básico 208036 | 10 diamantes; oferta original 8519 |
| Cristal da Eternidade 208058 | 50 diamantes; nova oferta local 985058 |

A oferta avançada é uma decisão local: as tabelas recuperadas só tinham esse cristal em loja de pontos, sem preço em diamantes. Sua oferta original em pontos continua intacta. A nova oferta é enviada nas tabelas do cliente, e pode usar diamantes vinculados quando essa forma de pagamento é selecionada. O upgrade comum mantém a substituição já existente de material faltante por 6 diamantes (`mar_ring_points`); isso é diferente da compra explícita na loja. O upgrade avançado consome os cristais comprados, sem desconto silencioso de diamantes.

## Validação e implantação

- 32 testes aprovados: integração social, ciclo completo da cerimônia, presença/reconexão da casa e do salão, compra básica e avançada, saldo insuficiente, carrinho atômico e tabela de loja idempotente.
- TypeScript/build aprovados, sem formatter.
- AIR real: decodificação nativa de presença em ambas as instâncias, identificadores de NPCs, confirmação de diálogo e atualização do modelo da recepção; também regressão dos pacotes matrimoniais anteriores. Registro: `reports/social/marriage-native-runtime.json`. Não equivale à inspeção visual de uma sessão completa no launcher.
- Nenhum SWF de produção foi alterado e nenhuma conta, consentimento ou voto foi fabricado. A cerimônia das contas 1826/1827 continua no estágio anterior aos votos.
- Backup SQLite consistente: `data/backups/before-wedding-npcs-presence-20261021.sqlite`; `quick_check=ok`.
- Servidor reiniciado localmente, PID 11072, HTTP 8080/TCP 5004/policy 843. `/healthz` confirma `tutorial`, `cache-first`, `gameListening=true`. Tabelas reais servidas via HTTP 200 incluem a oferta avançada com o preço correto.

Feche e reabra o launcher para receber as tabelas atualizadas. Entre com os dois noivos no salão; cada um deve aproximar-se de Andrew e confirmar seus votos. Depois, as opções da Recepção ficam disponíveis de acordo com as ações ainda pendentes.
