# Habilidades da profissão inicial

Este módulo fecha o aprendizado e a distribuição das 15 famílias iniciais de guerreiro, arqueiro e mago: 46 registros de níveis por classe. Exclui as seis famílias avançadas de nível 80 e as árvores reformuladas 421/422/423. Não implementa as abas Tropas, Runa ou Dom natural, nem modifica os executores de combate.

## Pontos e páginas

O total de pontos é `floor(min(nível, 80) / 2)`. As duas habilidades do tutorial começam aprendidas no nível 1 e usam dois pontos apenas na distribuição inicial. Depois de um reset elas podem ser aprendidas manualmente, como qualquer habilidade. No nível 10 são cinco pontos totais e três disponíveis. Um salto de níveis ou uma reconexão recalcula o saldo, sem conceder pontos em duplicidade. Cada nível aprendido custa um ponto; o upgrade substitui o ID anterior da família.

Cada página tem sua própria lista de habilidades e cinco atalhos. O aprendizado valida classe, próximo nível, nível do personagem, pré-requisitos e saldo. Uma nova ativa entra no primeiro slot vazio. Uma passiva não ocupa atalhos; um upgrade mantém o atalho da família. Atalhos repetidos, passivas ou habilidades não aprendidas são rejeitados.

A segunda distribuição começa vazia e pode ser comprada no nível 38 por 600 diamantes, usando a centralização de currencies. O pagamento vinculado usa primeiro diamantes vinculados e completa com diamantes comuns. A repetição da compra não cobra novamente. Somente a página ativa fornece seus bônus. Reset remove todas as habilidades da página ativa, devolve todos os pontos e limpa os cinco atalhos, sem reaprender o tutorial ao relogar: gratuito antes de 25; depois custa 100 diamantes. Benefícios de contratos premium não fazem parte desta etapa.

Operações, moeda e save usam a transação atômica do CityWorld. É necessário terminar a batalha antes de modificar a distribuição. A confirmação envia os modelos atuais do personagem e exército, o callback de aprendizado/reset e a barra atualizada.

## Descrições

`descriptions.ts` altera somente a resposta local de tempinfos.xml. O original preservado no cache não é alterado; o modo online continua a servir os recursos originais. Somente as descrições dos 138 registros iniciais e os dois marcos de configuração de pontos são ajustados.

Coeficientes permanecem como placeholders resolvidos pelo getter do cliente, permitindo que cada nível use seus próprios parâmetros. Chamas de Fogo utiliza Parameter1 (115 no primeiro nível), Regeneração usa o coeficiente absoluto da tabela (-50 → 50) e Luz da Graça Divina usa o seu coeficiente de cura. As passivas de atributos mostram os valores de SkillPropertyTempInfos e os efeitos de cura de SkillBufferTempInfos. O parâmetro fixo adicional de dano, quando existente, também aparece. Os demais parâmetros, requisitos, custos, ações, buffers e habilidades avançadas permanecem intactos.

## Atributos

O cliente recebe os atributos finais do herói do servidor, sem expor a fórmula original integral. A regra local adotada é somar fontes brutas e conversões primárias, então aplicar os percentuais das passivas aprendidas. Percentuais de habilidades no mesmo atributo são somados antes da aplicação; cada família contribui apenas pelo seu nível atual. O resultado é arredondado para baixo e a capacidade de combate é ajustada pela diferença correspondente.

`skills:basic` é uma fonte própria de atributos permanentes, baseada nas tabelas. O bônus de ataque mágico altera ataque mágico, não inteligência; o bônus de crítico altera o atributo, não diretamente sua probabilidade. Equipamentos, modas e construções entram no bruto sobre o qual o percentual atua. O cálculo é refeito ao aprender, resetar, trocar página e alterar o restante das fontes. Nenhum efeito temporário de batalha é acrescentado ao painel.

Os gatilhos de fúria, cura, bloqueio, escudo e outros buffs de combate continuam pendentes do executor de efeitos. Aprender uma habilidade corretamente não significa que um efeito de batalha ainda não reconstruído passe a funcionar nesta etapa.

## Migração

Novas contas recebem apenas as duas habilidades iniciais. Saves anteriores preservam o nível mais alto válido por família, removem habilidades de classe/requisito incompatível e recuperam o saldo pela regra de pontos. São removidos apenas os deltas históricos atribuíveis aos casos antigos de aprendizado/reset; outras fontes e os itens não são reiniciados. A primeira migração é registrada no log e persistida.

Testes: `test/skills.test.ts`, cobrindo classes, pré-requisitos, pontos, atalhos, páginas, moeda, persistência, percentuais sobre equipamentos e preservação dos arquivos/tabelas avançadas. A validação das contas existentes foi realizada em uma cópia do banco, registrada em `data/basic-skills-migration-validation.json`.
