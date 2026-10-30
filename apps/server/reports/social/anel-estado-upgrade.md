# Verificação do anel matrimonial

Estado real das contas pirata_teste (1826) e pirata_teste_2 (1827): casamento 1, status 1 (noivado), qualidade 0, fase 0. Existe qualidade 1 pendente de confirmação, pagante 1826. Não existem registros em social_marriage_progress: ainda não receberam o anel matrimonial após os votos.

O upgrade já está implementado em MarriageFeature.handle, opcode 8759, operação 12. Exige status 3 (casamento concluído), consome materiais na mochila, fornece XP, evolui pela tabela 36, atualiza as habilidades selecionadas e publica 357/49100. Usa 208036 antes do grau 9 e 208058 a partir do grau 9; cada unidade entrega 10 XP. Lotes: 50 normais ou 10 avançados. A ausência de materiais normais pode ser complementada por diamantes segundo a tabela; sem material avançado a operação não consome parcialmente. Os dados são persistidos no banco.

O cliente MarryRingView mostra o botão de upgrade quando marriangeState é diferente de zero, abrangendo o noivado. Isso não corresponde a receber o anel: antes dos votos o snapshot corretamente informa ring_grade=0 e ring_skill vazio. A tabela 36 do grau 0 não oferece habilidades. O botão aparecer antecipadamente não autoriza o upgrade. Não foi falsificado casamento nem atribuído anel às contas reais para contornar isso.

Teste acrescentado: reproduce noivado e escolha pendente; tentativa de upgrade é bloqueada sem consumir itens nem criar progresso. Após aprovação, entrada no salão e primeiro voto continua bloqueado. Depois do voto do parceiro, recebe grau 1; uma unidade normal entrega 10 XP; dez lotes de 50 consomem 500 unidades adicionais, levam ao grau 2, deixam 10 XP e selecionam 9992. Conferência final no banco confirma grau/XP persistidos. Os dois testes de integração executados passaram.

O probe AIR atual também passou com módulos 2/9/5/14/15, confirmando protocolo e modelo matrimonial nativo. Esse probe não equivale à conferência visual completa da janela em cada estado. Nenhum SWF nem regra de produção foi alterado nesta verificação.

Próximo passo real: pirata_teste_2 confirmar a cerimônia pendente; ambos entrarem no salão e confirmarem os votos. Então reabrir mochila/janela de anel. Se a janela inteira continuar vazia após status 3 e grau 1, isso exige investigação adicional da renderização; não se deve tratar a falta atual de anel como prova de que toda a interface está correta.


## Correção posterior da interface (21/10/2026)
O log real do launcher demonstrou ReferenceError #1069 ao abrir a janela do anel. A falta de anel durante o noivado não era uma explicação suficiente para a tela vazia. A ponte do módulo 9 consultava campos ringGrade/ringGp/happy inexistentes em MarryInfo enquanto a resposta assíncrona ainda não havia chegado. A correção usa MarriageData nativo nesse intervalo e foi executada no AIR sem dados artificiais prévios. Veja confirmacao-casamento-correcao.md para as demais correções da confirmação e do protocolo.
