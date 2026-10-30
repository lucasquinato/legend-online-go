# Casamento — integração local (21/10/2026)

## Diagnóstico das contas existentes
`pirata_teste` (1826, bendas) e `pirata_teste_2` (1827, achackrod) tinham um **noivado**: registro 1, estado 1, qualidade 0 e nenhuma cerimônia comprada. Não tinham registro de evolução de anel. Isso explica impedir outro pedido sem entregar benefícios de casamento. O estado 3 representa casamento concluído. O noivado foi preservado para permitir a conclusão pelo Andrew, sem reset ou casamento automático.

Havia também um erro real de protocolo: o layout antigo usado em 4657 não corresponde ao core fixado no projeto e faltava a atualização nativa 357. A janela adaptada de casamento recebia uma ponte JSON, mas os consumidores nativos, incluindo o slot do anel na mochila, permaneciam sem os dados corretos.

## O que foi integrado
- Descritores dos 13 protobufs de casamento conferidos com o AS3 do core fixado. Atualização 4657 com parceiro/nome/estado/data/contadores e 357 com titular, estado, felicidade própria e do parceiro e anel. A ponte anterior 49100 permanece compatível, sem mudanças nos SWFs publicados.
- Andrew, nó 22 do Reino do Céu, atende a visita nativa 8692; posição e alcance são os da tabela. Suas opções nativas de pedido, cerimônia, salão, divórcio e sintonia permanecem, e foi acrescentada a opção nativa 21 para missões matrimoniais. Outros NPCs, tabelas e portais não foram alterados.
- Pedido com consumo do item 208033, recusa/aceite, expiração, exclusividade do relacionamento e vínculo persistente. Não há novo bloqueio de nível.
- Cerimônia com equipe de dois, líder, seleção da qualidade, consentimento do parceiro e pagamento único ou dividido. Débitos usam a central de moedas; falha do segundo pagamento desfaz o primeiro no banco e no estado em memória.
- Criação do salão após aprovação, lista nativa, senha, convidados, presença e movimento dos jogadores. Há NPCs interativos para os votos e recepção. A compra não se repete ao enviar novamente a confirmação de criação.
- Votos exigem os dois noivos presentes e confirmação de ambos no primeiro casamento. Ao concluir, muda para estado 3, inicializa o anel, envia os presentes da qualidade por correio uma vez e atualiza ambos os personagens.
- Recepção registra bolo, champanhe, doces, buquê individual, fogos, presentes de convidados, convites, senha e expulsão de convidados. Presentes em ouro seguem a qualidade; diamantes validam valor positivo e limite de envios. Os recursos destinados ao casal são entregues por correio. O salão dura 120 minutos, conforme `mar_time`; expiração e expulsão retornam o personagem à cidade.
- Retomada do relacionamento, anel e missão aceita ao reconectar. O estado da sala é removido da lista quando expira. O campo temporário de cerimônia é limpo após os votos para liberar as opções da recepção no cliente.
- Anel no **slot matrimonial próprio da mochila**, fornecido por `MarriageDataMsg.ring`. Não é um item de equipamento comum nem o anel 208033 comprado para propor. A inspeção de outro jogador inclui o nível do anel e o nome do parceiro.
- Evolução do anel pelas tabelas 36; Coração Eterno 208036, Cristal da Eternidade 208058, compra complementar normal a 6 diamantes/unidade e seleção das combinações de habilidades desbloqueadas. Felicidade pelas tabelas 35, usando o material selecionado pelo cliente: 208034 (+1 XP) ou 208057 (+10 XP). Ajuda ao parceiro respeita custo/limite e a escolha de diamantes vinculados aceita pela janela.
- Atributos da felicidade usam o **menor nível entre os parceiros**, como o AS3 da janela. A fonte bruta `marriage` segue a central de atributos e as conversões usuais; noivado não ativa essa fonte. Não foram criadas compensações negativas.
- Em duelos coletivos existentes, o motor recebe as habilidades selecionadas somente se os cônjuges estão do mesmo lado. Cura do casal respeita alvos, recarga e usos. Ressurreição do parceiro usa os percentuais/recuperação de fúria descritos nas habilidades e o pacote nativo `waitRevives`. Não há benefício matrimonial por enfrentar o próprio cônjuge.
- Missões matrimoniais diárias nativas de conversar com NPC (4001, 4004, 4005): aceitar em equipe com o parceiro online, visitar o alvo real, concluir, atualizar objetivos/contadores e premiar ambos uma única vez. Limite de 10/dia e recompensas das tabelas.
- Sintonia/Apaixonados: convite e aceite, perguntas recuperadas, respostas individuais, sincronia, tempo por pergunta e encerramento. Respostas repetidas não alteram a primeira; recompensas são únicas: 50 Corações de Rosa por acerto em comum e 1 Coração Eterno a cada dois acertos. Entrega por correio aos dois.
- Divórcio unilateral: 1.200 diamantes; consensual: pedido nativo 358, aceite/recusa, 1.000 diamantes por participante somente ao aceitar; gratuito após cinco dias de ausência do parceiro, conforme o gate nativo atual. Noivado pode ser cancelado. Benefícios e vínculo deixam de valer na separação, preservando evolução individual do anel. O salão ativo precisa encerrar antes da separação.

## Qualidades recuperadas
| Qualidade | Preço em diamantes | Mapa |
|---|---:|---:|
| Amor de Mil anos | 11.999 | 4303 |
| Casamento Nobre | 3.188 | 4302 |
| Casamento Normal | 1.199 | 4301 |

O servidor considera os 80% de preço dentro das 72 horas após o casamento para nova cerimônia. A ponte de UI anterior ainda pode exibir o preço integral nessa situação; essa prévia deve ser alinhada em uma revisão específica do SWF.

## Decisões e limites explícitos
Esta entrega torna utilizável o ciclo principal de noivado → salão → casamento → anel/evolução/benefícios → separação. **Não equivale a reproduzir integralmente todos os efeitos e eventos do servidor original.**

- Os NPCs do salão usam os recursos recuperados 3019/3018, mas suas posições internas foram escolhidas para permitir interação: não foram obtidas de uma captura de cerimônia original. O arranjo e o diálogo precisam de teste visual no launcher.
- O anel inicia no grau 1. A tabela de qualidades recuperada não contém o antigo campo `RingGrade` que outra janela referencia; não foi inventado um grau diferente para cada preço.
- A sintonia usa 10 perguntas, 30 segundos por pergunta e uma participação diária. São decisões operacionais do servidor local onde não havia configuração recuperada suficiente; não foram apresentadas como temporização comprovada do online.
- Das cinco definições matrimoniais recuperadas, três foram integradas. **4002 (Flecha do Cupido, combate cooperativo) e 4003 (fogos numa posição) permanecem fora do sorteio.** Seu item/posicionamento e encontro não foram falsamente tratados como conclusão automática. Precisam de integração própria com encontro de mapa e seus efeitos.
- Cortejo de carruagem da qualidade 1, sequência cinematográfica original dos votos, lançamento/coleta física de buquês/doces e todas as animações de recepção ainda exigem integração visual própria. Registrar a ação/estado da recepção não comprova reproduzir esses efeitos.
- A busca/recomendação automática de pretendentes continua pendente; pedido direto via personagem e Andrew usa a relação real.
- A ligação com a pastagem **não foi implementada nesta entrega**. O handler provisório 8773 já existente não foi expandido nem validado como original. O novo 357 omite `god_tree`. A ponte antiga continua presente para compatibilidade.

## Teste manual recomendado
1. Fechar e reabrir os dois launchers após reiniciar o servidor.
2. Entrar nas duas contas existentes, formar equipe de dois e ir ao Andrew (nó 22, Reino do Céu).
3. Como líder, escolher a cerimônia; o parceiro confirma. Entrar no salão pela opção do Andrew.
4. Com ambos presentes, confirmar os votos no sacerdote com cada jogador. Abrir novamente a mochila: o slot matrimonial deve mostrar o anel; a janela de casamento deve mostrar o parceiro.
5. Conferir os presentes no correio, evoluir anel/felicidade, testar recepção, relogar e conferir persistência. Testar sintonia e missão diária pelo Andrew.
6. Para habilidades de casal, usar a mesma equipe contra outro jogador/equipe: duelo 1×1 entre os cônjuges não é combate em cooperação.

## Evidência e validação
Fontes locais: `reports/social/pinned-core/scripts`, `reports/social/andrew-evidence/scripts`, `reports/social/marriage-cycle-evidence/scripts`, `reference/social/content.json`, `reference/social/cycle-tables.json`, `reference/ui-compat/release-lock.json`.

- Testes sociais cobrem cerimônia, pagamentos, slot/protocolo, missão, sintonia, separação, persistência de dados e preparação real de duelo com habilidades do casal.
- Testes do motor cobrem cura do casal, alvos, limite de usos e ressurreição única com HP/fúria e serialização nativa.
- Regressão adicional cobre batalha, atributos centrais, moedas, modas, residência, chat e Reino do Céu.
- `scripts/verify-marriage-cycle.mjs` executa o AIR real com os módulos atuais 2, 9, 5, 14 e 15. O probe decodifica 4657/4691 e passa 357 pelo listener real do `MarryManager`, verificando o modelo atualizado. Registro: `reports/social/marriage-native-runtime.json`.
- Não houve alteração de SWFs de produção, de lógica de modas nem uso de formatter. Testes de protocolo e AIR não substituem a conferência visual completa pelo usuário.

Servidor local reiniciado: HTTP 8080, jogo TCP 5004, policy 843, `tutorial`/`cache-first`; health confirma jogo escutando. Backup consistente preservado em `data/backups/pre-marriage-integration-2026-10-21-1792557509545.sqlite` (quick_check: ok). São 132 testes distintos aprovados, mais o probe AIR. Os 25 assets preservados passaram na conferência de hash e tamanho. A tabela servida pelo HTTP foi novamente decodificada e contém a opção de missões de Andrew. Resumo de validação: `reports/social/marriage-validation.json`.
