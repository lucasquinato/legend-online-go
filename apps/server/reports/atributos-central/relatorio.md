# Novo cálculo central de atributos

Verificação: 2026-10-14T19:57:56.506Z. Mudança aplicada sem reset de contas. Este relatório descreve o cálculo permanente do personagem, os seis equipamentos iniciais e a fúria de campanha/labirinto/abismo.

## O que foi corrigido

1. O nível da moda não fornece mais uma diferença congelada do painel antigo. O nível 200 fornece os fixos da tabela e 10% na camada global, acompanhando equipamentos, montarias, santuário, base natural e avaliações.
2. As fontes entregam primários e fixos brutos. A conversão de força/proteção/inteligência/físico/liderança ocorre somente no centro, uma vez. Foram removidos os caminhos de cálculo legado e de reconciliação que criavam compensações positivas/negativas.
3. Equipamentos iniciais entregam sua contribuição completa, substituindo as diferenças de troca de classe e o resíduo sem origem. Equipar, retirar ou trocar atualiza a fonte, sem criar uma subtração permanente.
4. O poder de combate é recalculado dos atributos finais. Não é carregado de uma captura nem recebido de cada fonte.
5. A fúria de nível de moda passou a ser recuperada da ligação SkillTempInfos → SkillBufferTempInfos (AttackType 23). No nível 200 são 110 pontos; a refinação máxima acrescenta 20. Novas batalhas respeitam o teto 100 e o cache da instância.
6. Tutorial e cidade compartilham os mesmos exemplares de equipamento e seus bônus. Reconectar ou mudar de cena não repete o sorteio. A base do nível 10 é específica da classe.

## Ordem e matemática

O fornecedor descreve valores em values, percentuais globais em percentages e efeitos exclusivos em scaling. O centro resolve esses efeitos exclusivos (por exemplo, refinação de moda e refino espiritual da montaria), soma as fontes, converte primários, aplica percentuais aditivos por atributo e arredonda para baixo. As regras próprias de arredondamento/cap da refinação e do refino espiritual são executadas pelo mesmo centro.

**Atributo final = floor((fixos diretos + efeitos dos primários) × (1 + soma dos percentuais / 100)).**

Os 10% da moda e os 15% de Controle de Magia tornam-se 25% de magia. Não se multiplicam em cascata. Percentuais exclusivos do refino espiritual da montaria afetam apenas sua própria contribuição; não multiplicam primários de equipamentos/modas.

| Primário | Conversão |
| --- | --- |
| Força | 4 ataque + 1 defesa |
| Proteção | 4 defesa + 4 resistência |
| Inteligência | 4 magia + 1 resistência |
| Físico | 20 vida |
| Liderança | 1 infantaria |

A base natural após o nível 10 mantém a regra escolhida: base da classe no nível 10 × max(1, nível atual − 10). Os campos base_* e total_* são projeções distintas: a base não é somada duas vezes ao total. No início do tutorial, os dois primeiros encontros conservam o orçamento das lições recuperadas; sua conversão também passa pelo centro. Na cidade e no terceiro encontro usa-se a base da classe. Passivas aprendidas e atributos dos exemplares entram no mesmo cálculo. O roteiro que garante a conclusão do tutorial foi preservado.

Poder = floor(ataque + defesa + floor(magia × 1,05) + resistência + crítico + vida/5 + infantaria). A vida corrente é limitada ao novo máximo; aumentar o máximo não cura automaticamente. Uma fonte inválida é recusada antes de modificar o painel.

## Seis equipamentos e aleatoriedade

| Classe | Arma | Armadura |
| --- | --- | --- |
| Guerreiro | 1011003: ataque 33 | 1041003: defesa 37 / resistência 16 |
| Arqueiro | 1012003: ataque 33 | 1042003: defesa 26 / resistência 26 |
| Mago | 1013003: magia 33 | 1043003: defesa 16 / resistência 37 |

Além do template, entram os bônus aleatórios efetivamente gravados no exemplar. A tabela recuperada possui 32 definições em 12 famílias: força, proteção, inteligência, liderança, físico, ataque, defesa, magia, resistência, vida, crítico e bloqueio. Cada item novo recebe três famílias diferentes, sorteadas com pesos iguais, sem reposição. Cada magnitude recuperada da família é equiprovável. Força + ataque é permitido; força + força e ataque + ataque são recusados.

O gerador usa randomInt. Ele roda uma vez por exemplar recebido, inclusive em um lote de itens não empilháveis. Movimentação, divisão, equipar/desequipar, consulta e reconexão conservam os identificadores de bônus. Contas/exemplares existentes não são sorteados novamente. No tutorial antigo sem metadados de exemplar, os IDs de bônus usados pela captura anterior são preservados; nas contas novas os IDs são persistidos já na primeira entrega.

**Escopo do equipamento:** atributos básicos e aleatórios desses seis templates. Não foram reconstruídos atributos dos demais equipamentos, encantamento ou gemas. Os exemplares das três contas verificadas estão sem encantamento/gemas. Essa limitação é explícita para não confundir esta correção pontual com o sistema completo de equipamentos.

## Fúria e cache de instância

Para uma nova batalha: min(100, max(fúria inicial calculada, fúria corrente ao terminar a batalha anterior da mesma instância)).

| Inicial bruta | Final anterior | Próxima batalha |
| --- | --- | --- |
| 130 | 10 | 100 |
| 16 | 36 | 36 |
| 16 | 0, após derrota | 16 |
| 16 | 36, mas saiu e retornou | 16 |

O cache pertence ao ID da campanha ou ao percurso e modalidade do Labirinto/Abismo. Passar pelo portal não cria outra instância. Vitória, derrota e reconexão conservam o cache. Sair para a cidade o apaga; mudar de modalidade/percurso usa outra identidade. Uma batalha em andamento conserva sua fúria corrente ao reconectar: o mínimo inicial não é reaplicado no meio dela.

A fúria inicial é metadado do resultado central; não é enviada como campo inexistente de HeroInfo/SimpleHeroInfo. O valor inicial é enviado pelo pacote de preparação de batalha. Foram retirados os valores 40/50 herdados das capturas de campanha/labirinto desse caminho. O tutorial mantém sua sequência de fúria roteirizada, necessária às lições iniciais.

## Migração e preservação

Cada save usa calculationVersion 2. O painel e as fontes antigas são arquivados em attributeMigration para auditoria, sem participar do cálculo. O resíduo desconhecido e as correções negativas de −33 ataque e −21 defesa não são fontes ativas. Qualquer tentativa de registrar uma fonte/percentual negativo, um valor não finito, um multiplicador inválido ou poder de combate como fonte é recusada.

A migração usa o estado atual dos itens, classe, nível, habilidades, pesquisas, modas e montarias. Não altera níveis, missões, itens, coleção, XP, moedas ou credenciais. O script de prévia prepara uma cópia do SQLite e verifica a preservação; --apply usa backup, comparação do estado antes do commit e uma única transação. O carregamento normal do jogo também migra os saves antigos uma vez.

## Contas verificadas

| Conta | Nível | Ataque | Magia | Defesa | Resistência | Vida | Poder | Fúria inicial bruta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pirata_teste | 80 | 1.101.195 | 1.324.788 | 1.358.780 | 1.624.795 | 6.001.091 | 6.692.253 | 130 |
| pirata_teste_2 | 18 | 4.200 | 2.196 | 2.485 | 2.212 | 11.037 | 16.835 | 0 |
| pirata_teste_3 | 18 | 1.485 | 489 | 1.517 | 1.050 | 15.369 | 9.320 | 6 |

Todos os valores acima coincidem com a recomposição do painel a partir das fontes persistidas. Há zero fontes negativas ativas nas 3 contas. Números são uma fotografia da verificação; a sessão do usuário pode continuar evoluindo o personagem.

### pirata_teste: contribuições antes dos percentuais globais

| Fonte | Ataque | Magia | Defesa | Resistência | Vida | Fúria inicial |
| --- | --- | --- | --- | --- | --- | --- |
| Base natural | 1.400 | 10.290 | 4.550 | 6.650 | 34.300 | 0 |
| Moda: nível | 4.200 | 4.200 | 4.200 | 4.200 | 42.000 | 110 |
| Moda: avaliação | 132.160 | 135.040 | 168.120 | 168.840 | 659.400 | 0 |
| Moda: refinação | 216.160 | 219.040 | 252.120 | 252.840 | 1.499.400 | 20 |
| Santuário | 4.608 | 4.608 | 3.072 | 3.072 | 7.680 | 0 |
| Passivas | 0 | 0 | 0 | 0 | 0 | 0 |
| Montarias | 642.540 | 686.620 | 803.175 | 814.195 | 3.212.700 | 0 |
| equipment:initial:1088507 | 8 | 33 | 2 | 9 | 0 | 0 |
| equipment:initial:1088508 | 11 | 0 | 16 | 37 | 58 | 0 |

Percentuais globais: total_phy_attack +10%, total_magic_attack +25%, total_phy_defence +10%, total_magic_defence +30%, total_live +10%.

### pirata_teste_2: contribuições antes dos percentuais globais

| Fonte | Ataque | Magia | Defesa | Resistência | Vida | Fúria inicial |
| --- | --- | --- | --- | --- | --- | --- |
| Base natural | 1.336 | 160 | 704 | 424 | 4.720 | 0 |
| Moda: nível | 0 | 0 | 0 | 0 | 0 | 0 |
| Moda: avaliação | 0 | 0 | 0 | 0 | 0 | 0 |
| Moda: refinação | 0 | 0 | 0 | 0 | 0 | 0 |
| Santuário | 2.592 | 2.016 | 1.728 | 1.728 | 4.320 | 0 |
| Passivas | 0 | 0 | 0 | 0 | 0 | 0 |
| Montarias | 20 | 20 | 25 | 25 | 100 | 0 |
| equipment:initial:1088507 | 41 | 0 | 2 | 9 | 0 | 0 |
| equipment:initial:1088508 | 11 | 0 | 26 | 26 | 58 | 0 |

Percentuais globais: total_phy_attack +5%, total_live +20%, total_force_hit +20%.

### pirata_teste_3: contribuições antes dos percentuais globais

| Fonte | Ataque | Magia | Defesa | Resistência | Vida | Fúria inicial |
| --- | --- | --- | --- | --- | --- | --- |
| Base natural | 1.016 | 160 | 880 | 680 | 6.320 | 0 |
| Moda: nível | 300 | 300 | 300 | 300 | 3.000 | 6 |
| Moda: avaliação | 0 | 0 | 0 | 0 | 0 | 0 |
| Moda: refinação | 0 | 0 | 0 | 0 | 0 | 0 |
| Santuário | 0 | 0 | 0 | 0 | 3.120 | 0 |
| Passivas | 0 | 0 | 0 | 0 | 0 | 0 |
| Montarias | 20 | 20 | 25 | 25 | 100 | 0 |
| equipment:initial:1088507 | 41 | 0 | 2 | 9 | 0 | 0 |
| equipment:initial:1088508 | 11 | 0 | 37 | 16 | 58 | 0 |

Percentuais globais: total_phy_attack +7%, total_magic_attack +2%, total_phy_defence +22%, total_magic_defence +2%, total_live +22%.

## Validação e limites

- Suíte completa: **326/326**, 0 falhas (tests-complete.log).
- Após o ajuste de compatibilidade do tutorial e o cenário adicional de cache de campanha: **34/34**, 0 falhas (tests-last-transitions.log).
- TypeScript check e build concluídos.
- Cobertura inclui as seis opções de personagem, todas as campanhas existentes, os 130 pisos reais, mochila/correio/recursos, modas, montarias, rollback de transações, identidade do personagem e pacotes de protocolo.
- Novos cenários verificam percentuais sobre fontes adicionadas depois, ausência de duplicação, recusa de negativos, migração/reconexão, RNG por família, ausência de sorteio em movimentos, transferência tutorial→cidade e cache de fúria em campanha/labirinto.
- Não foram alterados módulos SWF, imagens, a pasta do cliente, custos/regras de upgrade de modas ou sistemas de equipamentos fora dos seis templates. Nenhum formatter foi executado.
- A verificação foi automatizada, incluindo protocolo e ciclo de servidor. O teste visual no launcher continua sendo a validação do usuário; não há afirmação de teste visual realizado nesta etapa.

## Arquivos principais

- src/attributes.ts: classe central, conversões, validação, base natural e aplicação do painel.
- src/features/attributes/fashion.ts: definições brutas de moda e refinação.
- src/features/attributes/initial-equipment.ts: seis templates, RNG e fontes dos exemplares.
- src/features/attributes/fury.ts: mínimo inicial, cache e limite.
- src/features/fashion/feature.ts: integração, sem diferenças históricas.
- src/features/mounts/feature.ts: operandos do refino espiritual entregues ao centro.
- src/features/settlement/index.ts: pesquisas como fontes fixas, sem poder calculado pelo módulo.
- src/features/skills/index.ts: dados brutos das passivas.
- src/city-world.ts: recompõe fontes, arquiva legado e gere cache/instâncias.
- src/world.ts e src/combat.ts: exemplares persistidos do tutorial e uso do cálculo central.
- src/inventory.ts: callback de geração; movimentos preservam os bônus.
- reference/attributes/: tabela recuperada de bônus e fúria por nível.
- scripts/migrate-central-attributes.ts: migração segura e auditável.
- verification.json: snapshot, fontes, resultados e hashes desta verificação.

O contrato para integrar sistemas futuros está em src/features/attributes/README.md.
