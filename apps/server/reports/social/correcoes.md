# Correções de integração social

- Amigos passam a usar grupo nativo 2; vínculos antigos no grupo 0 migram ao
  carregar o serviço social. `online_state` e `chat_state` são enviados separadamente.
  Aceitar/remover amizade atualiza os estados da fazenda dos dois envolvidos.
  Não há expulsão de visitantes por remoção de amizade.
- Inspeção recebe os campos adicionais do protocolo atual, recuperados diretamente
  do core fixado: nível e poder na resposta de detalhes, nível/XP/aparência de moda,
  além dos atributos, equipamentos, Cosmos e slots do personagem observado.
  O payload preserva IDs reais e não inclui itens guardados na mochila.
- Compra do anel inicial 208033 habilitada na oferta original 12 da loja, por
  199 diamantes/unidade, sem nível mínimo. Compra direta e carrinho usam o ledger
  central, validação de destinatário/quantidade e entrega atômica na mochila.
  Ao escolher vinculados, usa esse saldo primeiro e completa com diamantes.
- Acompanhamento passa a receber pacotes nativos 4624 com coordenadas reais,
  imediatamente após movimentos no Reino do Céu e periodicamente enquanto
  conectado. O cliente já mantém followFlag ao chegar e cancela por intervenção
  manual; esse comportamento não foi alterado. Sem atualizações, ele seguia
  apenas a posição conhecida quando a equipe foi criada.

Compilação aprovada e 71 testes aprovados. Quatro regressões cobrem a integração
nos pacotes finais. Os dados das seis contas existentes também foram serializados
em 4125 e comparados com seus saves (`inspection-validation.json`).

Nenhum SWF foi modificado nesta correção. Reabra o launcher para limpar modelos
sociais e janelas já abertos; contas e progresso foram preservados.
