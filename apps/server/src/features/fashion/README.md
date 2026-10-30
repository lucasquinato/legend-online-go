# Modas — módulo concluído

Esta pasta reúne o comportamento de modas validado no cliente local. A separação é estrutural: não altera regras, custos, chances, requisitos, tabelas, mensagens ou progresso existente. Mudanças em outros sistemas devem usar esta interface e preservar o comportamento das modas.

## Organização

| Arquivo                                        | Responsabilidade                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `index.ts`                                     | Interface pública do módulo.                                                                           |
| `feature.ts`                                   | Comandos de absorção, avaliação e refinação; modelos do protocolo; contribuições de atributos e fúria. |
| `appearance.ts`                                | Coleção, remoção de `[Novo]`, seleção, ocultação e slots virtuais da aba de modas.                     |
| `progression.ts`                               | Curva de XP, nível máximo, bônus e serialização do progresso.                                          |
| `appraisal.ts`                                 | Custos, estrelas e atributos da avaliação a partir dos skills recuperados.                             |
| `refinement.ts`                                | XP, limites por coleção/partes, bônus e fúria da refinação.                                            |
| `state.ts`                                     | Contrato de persistência e serviços fornecidos pelo servidor.                                          |
| `import-progression.ts`, `import-appraisal.ts` | Extração das referências a partir do acervo do backend. Não executam durante o jogo.                   |

As regras e as evidências que fundamentam esta versão continuam documentadas em [MODAS.md](../../../MODAS.md), incluindo as interpretações adotadas anteriormente. Esta reorganização não redefine essas interpretações.

## Integração

`CityWorld` fornece `FashionContext`: inventário, ledger de ouro, transações, persistência e envio de pacotes. O módulo não abre uma conexão de banco própria, não cria contas e não acessa a pasta do cliente. Compra/consumo de recursos continuam usando os serviços centrais existentes.

O host delega os comandos a `handle`, os modelos a `model`, a projeção da mochila a `equippedFashionItems` e a retirada de um visual a `moveItem`. Na sincronização do herói, `syncAttributes` entrega fontes brutas ao calculador central. `initialRage` usa o mesmo centro e é combinado com o cache da instância na criação da batalha.

O contexto lê `state` e `saved` por getters. Isso é necessário porque uma transação que falha restaura o estado do host; o módulo deve acessar o estado restaurado na próxima operação.

| Entrada                    | Comportamento preservado                              |
| -------------------------- | ----------------------------------------------------- |
| 8594                       | Absorção/síntese.                                     |
| 8595                       | Seleção de aparência pelo comando antigo.             |
| 8631                       | Marcar uma moda como vista.                           |
| 8781                       | Avaliação.                                            |
| 9582                       | Salvar aparência e ocultação por parte.               |
| 9635                       | Consulta/upgrade de refinação.                        |
| 5005, via `moveItem`       | Retirar a projeção visual de um slot da aba de modas. |
| 8625, via host/modelo 4542 | Consultar a coleção.                                  |
| Modelos 301, 408, 4542     | Progresso, refinação e coleção.                       |

## Compatibilidade e validação

As chaves JSON `fashion`, `refinement` e `cosmeticIds`, os IDs de itens/skills, os comandos e a ordem dos pacotes permanecem iguais. A contribuição mantém as fontes `fashion:progression`, `fashion:appraisal` e `fashion:refinement`. A centralização autorizada em 14/10/2026 substituiu diferenças históricas por fontes brutas e fez os percentuais do nível incidirem sobre a soma global. Custos, progressão e aparências continuam preservados; consulte `../attributes/README.md` para o contrato e a migração.

Os arquivos antigos `src/fashion*.ts` e `src/import-*.ts` relacionados a modas são apenas entradas de compatibilidade, sem implementação duplicada. Novas integrações devem importar `src/features/fashion/index.ts`.

Na extração, 13 cenários tiveram seus pacotes e saves comparados com a implementação anterior, com resultados idênticos. A suíte cobre progressão, custos, atributos, aparências, limite 200, persistência, rollback, tutorial e cidade. Execute `npm test`, `npm run check` e `npm run build` a partir da pasta do servidor.
