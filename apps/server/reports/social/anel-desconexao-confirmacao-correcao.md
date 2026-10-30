# Desconexão no anel e confirmação pendente — correção complementar

## Log real
Em 21/10/2026, às 03:06:13, o launcher da pirata_teste_2 registrou VerifyError #1021 e encerrou o motor AIR com código 0. O servidor permaneceu ativo, sem exceção correspondente. Não foi queda do processo Node.

A correção anterior não cobria o handler de treino de felicidade de MarrySatisfactoryRateView, aberto a partir da janela do anel. A inspeção do bytecode publicado encontrou um jump no endereço 106 com destino 117, que não era início de instrução. O patch havia trocado o índice de uma constante por atribuição direta: a codificação do novo índice ocupava mais bytes e os saltos que atravessavam essa instrução não eram recalculados.

SocialUiPatch agora usa MethodBody.replaceInstruction, que recalcula os deslocamentos. O módulo foi regenerado a partir da versão fixa, com os patches de salões e confirmação preservados. Não houve transplante de classes nem alteração das Modas. A lista autorizada do módulo não foi ampliada.

## Confirmação
A confirmação 4658 era incluída no bootstrap com atraso 395 ms; os pacotes da cena começavam em 400 ms. O core pode recusar a abertura do controlador enquanto existem recursos prioritários carregando, ou não abrir a janela em contexto de batalha. Portanto, o envio no bootstrap não comprovava que a janela havia sido apresentada.

Agora o bootstrap envia somente os dados de estado matrimonial. A confirmação pendente é enviada após o cliente emitir 5017/8516, sinais observados no fluxo de inicialização da cena. Há uma única apresentação automática por conexão, com atraso adicional de 500 ms; a mesma rotina não dispara em batalha ainda não concluída. Atualizações sociais genéricas não substituem repetidamente a janela. Reconectar permite retomar a pendência. A visita explícita ao Andrew e a sincronização matrimonial continuam permitindo reapresentá-la; a confirmação no Andrew também segue após o diálogo.

Não foi aceito nem cancelado o pedido real. As contas 1826/1827 continuam noivas: pendingQuality=1, payer=1826, payType=1, fase 0. Nenhuma cobrança ou atribuição de anel foi antecipada.

## Verificação
- Auditoria estrutural do módulo: 3.377 métodos e 5.750 destinos de salto conferidos, todos válidos. O relatório inclui o hash da candidata.
- Novo gate AIR executa o handler real de felicidade, além de entrada fria e inicialização do anel. Isso fecha a lacuna do teste anterior, que exercitava o anel sem esse handler.
- Gates AIR de confirmação das três qualidades, aceitar/recusar/substituir, pagamento dividido e atualização dos cartões de salões preservados.
- Pacote 4658 decodificado pela classe protobuf do cliente nativo: qualidade e pagamento conferidos. Também passaram o setter de data e o listener de 357, com os módulos 2/9/5/14/15 juntos.
- 20/20 testes sociais: confirmação adiada até cena pronta, sem duplicação por atualização social, uma apresentação por conexão, retomada após reconexão, cobrança única, votos e anel, além das regressões anteriores.
- 17/17 contratos SWF e build TypeScript aprovados. Sem formatter.

O backend recusa módulo sem o gate de felicidade e a auditoria de saltos correspondente ao hash servido. Os builds futuros incluem essas exigências.

## Publicação
Servidor local tutorial/cache-first, HTTP 8080, TCP 5004 e policy 843, PID 2572. Health e bytes do módulo/índice conferidos: SHA-256 fbea140707e183d2fce3286c2e3f940725f3f8a6213ce0c192051efbeffae623, token 63c7a6d1, 330806 bytes.
Backup consistente: data/backups/pre-marriage-runtime-fix-1792563559558.sqlite, quick_check=ok.

Reabrir os launchers para carregar a versão nova e conferir visualmente a confirmação na pirata_teste_2 após a entrada na cena. Os testes de métodos/protocolo não equivalem a essa conferência interativa com as contas reais.

Evidências: marriage-runtime-backup.json, marriage-runtime-http.json, reference/social/local-ui/manifest.json, data/marriage-runtime-build.log, data/marriage-runtime-social.log, data/marriage-runtime-contract.log e data/marriage-runtime-native.log.

## Limite observado após reiniciar
O launcher reconectou as contas. Há ainda um TypeError #1009 registrado às 03:20:04, com stack de CastleWalkLayer/DisplayLoader, sem nova saída do motor nesse trecho do log. Essa mensagem não identifica a janela matrimonial e não foi usada como evidência de sucesso ou de falha da confirmação. A apresentação visual da confirmação continua exigindo conferência no launcher; o que esta entrega comprova é a correção do salto inválido, o fluxo servidor e os gates AIR descritos acima.
