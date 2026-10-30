# Correção da confirmação e do ciclo matrimonial — 21/10/2026

## Falhas identificadas e corrigidas

1. **A confirmação falhava ao montar as recompensas.** A tabela atual de qualidades possui `Rewards`, mas não define os antigos `ClothId`/`RingGrade` que a janela ainda consultava. Ela tentava renderizar GoodsInfo com template 0. O módulo 9 agora ignora esse item legado inexistente e apresenta o anel inicial de grau 1. Os presentes efetivamente entregues continuam vindo de `Rewards`; nenhum item, custo ou qualidade da conta foi substituído.
2. **Fechar tecnicamente a janela enviava recusa.** O método `dispose` era executado tanto ao substituir uma janela quanto depois de aceitar e enviava `qualityAnswer(false)`. A recusa passou para o handler de fechamento explícito (X/Esc). Aceite e aceite do pagamento dividido enviam somente `true`; substituição não envia resposta. A confirmação continua exigindo ação do parceiro.
3. **A janela do anel tinha erro real de inicialização.** O launcher registrou ReferenceError #1069 em MarryTrainFrame. A ponte consultava ringGrade/ringGp/happy em MarryInfo, onde esses campos não existem, antes da resposta assíncrona. Nesse intervalo ela agora devolve MarriageData nativo, com os submodelos inicializados pelos getters originais. O noivado sem anel não justificava sozinho a tela vazia; o relatório anterior do anel foi complementado.
4. **Data incompatível no pacote 4657.** MarryInfo.marriageTime recebe uma data formatada `YYYY-MM-DD hh:mm:ss`; o getter expõe segundos, mas isso não é o formato do setter. O servidor enviava segundos ou string vazia. Agora envia a data formatada ou o marco de 1970 para quem ainda não casou. O teste AIR passa o valor pelo setter nativo, além de decodificar o protobuf.
5. **Ordem ao visitar Andrew.** O diálogo nativo 4601 é enviado antes da confirmação 4658. A pendência é reapresentada ao parceiro após sincronização/visita, sem pagar novamente nem aceitar automaticamente.

## Estado real preservado

Casamento 1: pirata_teste (1826, bendas) e pirata_teste_2 (1827, achackrod). Permanecem noivos (status 1), fase 0, qualidade 1 pendente, pagamento individual por 1826. A confirmação pertence a 1827. Nenhuma conta foi resetada, nenhum voto foi inserido e nenhum pagamento foi antecipado. Backup consistente: `data/backups/pre-wedding-consent-fix-1792562358020.sqlite`, quick_check=ok.

## Sequência disponível para retomar

1. Reabrir os launchers para carregar o módulo 9 atualizado. Entrar nas duas contas.
2. Em pirata_teste_2, retomar a confirmação pendente. Se necessário, ir ao Andrew no Reino do Céu para reapresentá-la. Não precisa selecionar/comprar outra cerimônia enquanto a atual estiver pendente.
3. Aceitar: o servidor valida saldo e cobra uma única vez o pagante; cria o salão com novo prazo. A recusa explícita apenas cancela a seleção pendente, preservando o noivado.
4. Entrar no mesmo salão pelo Andrew com os dois personagens. A presença dos dois é obrigatória para os votos.
5. Cada conta confirma seus votos no sacerdote do salão. O primeiro voto não completa sozinho. O segundo conclui status 3, inicializa o anel no grau 1 e envia os presentes da qualidade uma única vez para cada cônjuge.
6. Mochila/janela matrimonial passam a receber o anel, parceiro, felicidade e habilidades reais. Upgrade usa a tabela 36 e o inventário; os efeitos são integrados aos atributos e ao motor de batalha. Repetir criação/votos não duplica cobrança nem presentes. Dados sobrevivem à reconexão.

## Validação

- 19/19 testes de integração social: pedido, aceite, pendência, recusa e nova seleção, ordem Andrew→confirmação, cobrança única, rollback do pagamento dividido, sala/presença, dois votos, presentes únicos, slot/anel, upgrade persistido, tarefas, sintonia, divórcio e habilidades de casal em batalha.
- AIR: a versão anterior reproduz a tentativa de carregar o item legado; a candidata executa `addReward` para as três qualidades e os handlers reais de aceite, fechar, substituir e pagamento dividido. Dependências gráficas são fixtures somente nas cópias de teste; não são publicadas.
- AIR: teste de entrada fria antes da resposta da ponte, inicialização do anel, gates sociais e lista de salões vazio→6→1→vazio.
- AIR: módulos atuais 2/9/5/14/15 carregados juntos; setter nativo da data e listener real de 357 validam o modelo matrimonial.
- Auditoria preserva todos os métodos/classes/recursos originais fora da lista explícita. Só três métodos adicionais de MarryConfirmFrame e a ponte isolada foram alterados nesta correção. Modas permanece protegida. 17/17 contratos SWF passaram; TypeScript compilou. Nenhum formatter foi executado.
- HTTP e índice conferidos: módulo 9 SHA-256 `933b39516b6d7da0863f6c9cab4d729d0c37aa65c1da91a0a84d29d4af69f970`, 330806 bytes, token `6192b715`. Health local confirma tutorial/cache-first e TCP ativo. Portas 8080/5004/843, PID 8984.

## Limites

Os testes executam os métodos Flash e o ciclo servidor, mas não substituem a conferência visual/interativa no launcher com as duas contas reais. A entrega corrige as interrupções identificadas; não comprova todo o efeito visual do online. Cortejo/cinemática original, efeitos físicos completos da recepção e as duas missões especiais já documentadas continuam pendentes. A integração matrimonial com pastagem não foi expandida.

Evidências: `reference/social/local-ui/manifest.json`, `reports/social/consent-http-validation.json`, `reports/social/consent-backup.json`, `data/marriage-consent-regression.log`, `data/marriage-consent-contract.log`, `data/wedding-consent-build.log`. Rebuild reproduzível: `scripts/swf/build-social-ui.mjs` inclui o patch e o gate da confirmação; o backend exige seus marcadores AIR.
