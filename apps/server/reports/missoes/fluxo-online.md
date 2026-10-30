# Fluxo de missões recuperado do online

Auditoria de 835 definições. A cadeia principal importada tem 146 registros: 91 dentro da janela de data e 55 aposentados.

Foram observadas 73 missões aceitas distintas e 85 resgates. Em 85 resgates, o bitmap chegou no pacote 112 antes da confirmação 52. Nenhuma missão aceita observada estava aposentada.

O fluxo é um grafo de pré-requisitos, não a ordem numérica dos IDs. Todos os IDs de PreQuestId precisam estar resgatados. Nível, datas e condições adicionais do cliente também limitam a disponibilidade. Missões manuais e repetíveis seguem categorias próprias.

Sequência inicial vigente: 1832 Voltar para a Cidade → 1834 Recrutar Soldados → 1836 Eleminar Lobos → 1839 Plantar → 1840 Labirinto → 1841 Planície de Byron → 1838 Elevar o nível dos soldados → 1843 Templo de Ishtar → 1844 Santuário de Ishtar → 1848 Contratar Arqueiros → 1847 Planície dos Furries → 1850 Montanhas Tribais → 1852 Campo de Carlow → 380 Abismo do Sussuro.

Correções locais: disponibilidade por data; histórico atualizado antes de 52; quadro posterior com somente missões ativas; bitmap preservado ao resgatar casos capturados; resgate idempotente; recompensa explícita de ouro separada da produção passiva; anexos de moeda creditados pelo ledger.

O histórico interno é preservado. Missões principais resgatadas não reaparecem; tarefas repetíveis podem reaparecer quando as suas regras permitirem. A próxima missão só é liberada quando todos os requisitos são atendidos. Não são criados saltos artificiais sobre pré-requisitos.

Limite: a definição de uma missão não implementa automaticamente sua funcionalidade. Objetivos de sistemas ainda ausentes permanecem pendentes; esta auditoria não confirma o jogo inteiro como reproduzido.

Evidência do cliente: reference/campaign/evidence/current2/scripts/yishi/manager/TaskManage.as, handlers __questUpdateHandler e __questFinishHandler, checkPreTask, isAvailableTask, IsTaskFinish; tabelas em reports/missoes/missoes.json; evidência de rede em online-quest-flow.json.

| ID | Missão | Pré-requisitos | Nível mínimo | Disponibilidade | XP | Ouro | Espírito | Cristais | Itens/anexos |
|---|---|---|---:|---|---:|---:|---:|---:|---|
| 1840 | Labirinto Subterrâneo | 1839 | 1 | Vigente | 20000 | 0 | 0 | 0 | 3110008 × 1 (classe 1); 3110012 × 1 (classe 2); 3110014 × 1 (classe 3) |
| 1836 | Eleminar Lobos | 1834 | 1 | Vigente | 15000 | 0 | 0 | 0 | 2160002 × 2 (classe 0); 208008 × 1 (classe 0); -600 × 100000 (classe 0) |
| 1834 | Recrutar Soldados | 1832 | 1 | Vigente | 2000 | 0 | 0 | 0 |  |
| 1841 | Planície de Byron | 1840 | 1 | Vigente | 37000 | 2000 | 1000 | 0 | 2030707 × 1 (classe 0) |
| 1835 | Técnicas de COmbate | 1838 | 5 | Aposentada | 2000 | 0 | 2000 | 0 |  |
| 1843 | Templo de Ishtar | 1838 | 1 | Vigente | 45000 | 1000 | 0 | 0 | 2050601 × 4 (classe 0) |
| 1844 | Santuário de Ishtar | 1843 | 1 | Vigente | 81000 | 6250 | 0 | 0 | 2030707 × 1 (classe 0) |
| 1832 | Voltar para a Cidade | — | 1 | Vigente | 14000 | 3000 | 0 | 0 |  |
| 1847 | Planície dos Furries | 1848 | 15 | Vigente | 25500 | 0 | 20000 | 0 |  |
| 1848 | Contratar Arqueiros | 1844 | 1 | Vigente | 15500 | 4500 | 0 | 0 |  |
| 1849 | Taus | 1847 | 1 | Aposentada | 25500 | 1500 | 0 | 0 |  |
| 1850 | Montanhas Tribais | 1847 | 17 | Vigente | 31000 | 2000 | 0 | 0 |  |
| 1851 | Paradeiro das Tropas | 1850 | 1 | Aposentada | 25500 | 1000 | 0 | 0 |  |
| 1852 | Campo de Carlow | 1850 | 1 | Vigente | 31000 | 4500 | 0 | 0 |  |
| 1853 | Regresso do Herói | 1852 | 1 | Aposentada | 45500 | 2000 | 0 | 0 |  |
| 380 | Abismo do Sussuro | 1852 | 1 | Vigente | 13000 | 6000 | 0 | 0 | 2030503 × 2 (classe 0); 2030707 × 1 (classe 0) |
| 787 | Deserto da Morte | 740,750 | 41 | Aposentada | 128000 | 16000 | 0 | 0 |  |
| 826 | Terra do Julgamento | 787 | 51 | Aposentada | 256000 | 16000 | 0 | 0 |  |
| 400 | Armadura dos Guardiões | 380 | 1 | Aposentada | 20000 | 6000 | 0 | 0 |  |
| 410 | Pantanal do Rugido | 380 | 1 | Vigente | 24000 | 6000 | 0 | 0 | 2030707 × 1 (classe 0) |
| 420 | Rabo do Lagarto | 410 | 1 | Aposentada | 24000 | 6750 | 0 | 0 |  |
| 430 | Campo da Penumbra | 410 | 1 | Vigente | 42000 | 6750 | 0 | 0 | 2030503 × 2 (classe 0); 2030707 × 1 (classe 0) |
| 440 | Ninho da Águia Serpente | 410 | 1 | Vigente | 42000 | 6750 | 0 | 0 | 2030707 × 1 (classe 0) |
| 450 | Exterminar Campo de Batalha | 430 | 1 | Aposentada | 42000 | 6750 | 0 | 0 |  |
| 460 | Pena da Águia Serpente | 440 | 1 | Aposentada | 42000 | 6750 | 0 | 0 |  |
| 470 | Selva Escura | 430 | 1 | Vigente | 48000 | 6750 | 0 | 0 | 2030503 × 2 (classe 0) |
| 480 | Exterminar Lanceiro Fantasma | 470 | 1 | Aposentada | 48000 | 6750 | 0 | 0 |  |
| 490 | Exterminar Arqueiro Fantasma | 470 | 1 | Aposentada | 48000 | 6750 | 0 | 0 |  |
| 500 | Grande Espada Demônio | 470 | 1 | Vigente | 54000 | 6750 | 0 | 0 | 2030707 × 1 (classe 0) |
| 510 | Exterminar Espectro | 500 | 1 | Aposentada | 54000 | 6750 | 0 | 0 |  |
| 520 | Osso do Espectro | 500 | 1 | Aposentada | 54000 | 6750 | 0 | 0 |  |
| 550 | Penhasco do Destino | 500 | 1 | Vigente | 60000 | 7500 | 0 | 0 | 2030503 × 2 (classe 0); 2030707 × 1 (classe 0) |
| 560 | Exterminar Cavaleiro Fantasma | 550 | 1 | Aposentada | 64000 | 7500 | 0 | 0 |  |
| 570 | Bastão Demônio | 550 | 1 | Aposentada | 64000 | 7500 | 0 | 0 |  |
| 580 | Pântano Sem Fim | 550 | 1 | Aposentada | 25000 | 7500 | 0 | 0 |  |
| 590 | Pântanos da Banshee | 550 | 1 | Vigente | 72000 | 7500 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 600 | Exterminar Lagarto | 590 | 1 | Aposentada | 72000 | 7500 | 0 | 0 |  |
| 610 | Rabo do Lobo | 590 | 1 | Aposentada | 72000 | 7500 | 0 | 0 |  |
| 620 | Pântano das Trevas | 590 | 1 | Vigente | 84000 | 9000 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 630 | Exterminar Espadachim das Sombras | 620 | 1 | Aposentada | 84000 | 9000 | 0 | 0 |  |
| 640 | Arco das Sombras | 620 | 1 | Aposentada | 84000 | 9000 | 0 | 0 |  |
| 660 | Lago da Tranquilidade | 620 | 1 | Vigente | 96000 | 9000 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 670 | Pântano da Morte | 620 | 1 | Vigente | 96000 | 9000 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 680 | Material de Ressurreição | 590 | 1 | Aposentada | 96000 | 9000 | 0 | 0 |  |
| 700 | Exterminar Feiticeiro das Sombras | 660 | 1 | Aposentada | 96000 | 10500 | 0 | 0 |  |
| 710 | Crânio do Imortal | 670 | 1 | Aposentada | 96000 | 10500 | 0 | 0 |  |
| 720 | Ritual de Ressurreição | 660,670 | 1 | Vigente | 108000 | 10500 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 730 | Exterminar Templo | 720 | 1 | Aposentada | 108000 | 10500 | 0 | 0 |  |
| 800 | Rei dos Vermes Shatar | 740,750 | 1 | Vigente | 126000 | 31500 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 827 | Legendário Espadachim Sagrado Falter | 806,807 | 1 | Vigente | 252000 | 31500 | 0 | 0 | 3101071 × 24 (classe 0) |
| 879 | Garganta Sanguinária | 833 | 1 | Vigente | 300000 | 35000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 897 | Santuário Eterno | 885 | 1 | Vigente | 420000 | 75000 | 0 | 0 | 3101071 × 30 (classe 0) |
| 740 | Terra dos Mortos | 720 | 1 | Vigente | 120000 | 10500 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 802 | Armadura Imortal Laya | 801 | 30 | Vigente | 138600 | 34650 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 829 | Pior dos Pesadelos | 828 | 1 | Vigente | 277200 | 34650 | 0 | 0 | 3101071 × 24 (classe 0) |
| 881 | Mundo do Juízo | 880 | 1 | Vigente | 350000 | 45000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 750 | Ruína dos Imortais | 720 | 1 | Vigente | 120000 | 10500 | 0 | 0 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 752 | Elevar ao nível 40 | 750 | 38 | Vigente | 120000 | 10500 | 0 | 0 | 208017 × 20 (classe 0) |
| 803 | Dunas da Morte | 802 | 1 | Vigente | 144900 | 36225 | 0 | 2000 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 830 | Julgamento do Demônio | 828 | 1 | Vigente | 289800 | 36225 | 0 | 10000 | 3101071 × 24 (classe 0) |
| 882 | Cemitério das Almas | 880 | 1 | Vigente | 350000 | 45000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 1839 | Plantar na Fazenda | 1836 | 12 | Vigente | 8000 | 5000 | 0 | 0 |  |
| 805 | Deserto de Ukiha | 803,804 | 1 | Vigente | 148050 | 37000 | 0 | 4000 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 806 | A Morte Valdis | 805 | 1 | Vigente | 151200 | 37800 | 0 | 0 | 3101071 × 24 (classe 0) |
| 807 | Cemitério dos Dragões | 805 | 1 | Vigente | 151200 | 37800 | 0 | 5000 | 3101071 × 24 (classe 0) |
| 808 | Exterminar Verme Flamejante | 800 | 1 | Aposentada | 126000 | 31500 | 0 | 0 |  |
| 809 | Exterminar Assassino do Deserto | 801 | 1 | Aposentada | 132300 | 33075 | 0 | 0 |  |
| 810 | Exterminar Espada Imortal | 802 | 1 | Aposentada | 138600 | 34650 | 0 | 0 |  |
| 811 | Exterminar Assassino das Areias | 803 | 1 | Aposentada | 144900 | 36225 | 0 | 0 |  |
| 812 | Exterminar Espadachim Maligno | 804 | 1 | Aposentada | 144900 | 36225 | 0 | 0 |  |
| 813 | Exterminar Verme Devorador de Espíritos | 805 | 1 | Aposentada | 148050 | 37000 | 0 | 0 |  |
| 814 | Exterminar Monstro Ilusivo | 806 | 1 | Aposentada | 151200 | 37800 | 0 | 0 |  |
| 815 | Exterminar Soldado Dragão | 807 | 1 | Aposentada | 151200 | 37800 | 0 | 0 |  |
| 832 | Julgamento da Morte | 830 | 1 | Vigente | 296100 | 37000 | 0 | 20000 | 3101071 × 24 (classe 0) |
| 833 | Fim do Julgamento | 832 | 1 | Vigente | 302400 | 37800 | 0 | 0 | 3101071 × 24 (classe 0) |
| 835 | Exterminar Lanceiro Sagrado | 827 | 1 | Aposentada | 252000 | 31500 | 0 | 0 |  |
| 836 | Exterminar Griffin Furioso | 828 | 1 | Aposentada | 264600 | 33075 | 0 | 0 |  |
| 837 | Exterminar Caçador do Pesadelo | 829 | 1 | Aposentada | 277200 | 34650 | 0 | 0 |  |
| 838 | Exterminar Lobo Devorador de Almas | 830 | 1 | Aposentada | 289800 | 36225 | 0 | 0 |  |
| 839 | Exterminar Soldado do Caos | 831 | 1 | Aposentada | 289800 | 36225 | 0 | 0 |  |
| 840 | Exterminar Cavaleiro Imaginário | 832 | 1 | Aposentada | 296100 | 37000 | 0 | 0 |  |
| 841 | Exterminar Urso Destruidor | 833 | 1 | Aposentada | 302400 | 37800 | 0 | 0 |  |
| 884 | Trono da Destruição | 883 | 1 | Vigente | 400000 | 55000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 885 | Fonte da Maldição | 883 | 1 | Vigente | 400000 | 55000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 886 | Exterminar Formiga Sanguinária | 879 | 1 | Aposentada | 300000 | 35000 | 0 | 0 |  |
| 887 | Exterminar Fantasma do Abismo | 880 | 1 | Aposentada | 320000 | 40000 | 0 | 0 |  |
| 888 | Exterminar Escravo do Julgamento | 881 | 1 | Aposentada | 350000 | 45000 | 0 | 0 |  |
| 889 | Exterminar Lança Amaldiçoada | 882 | 1 | Aposentada | 350000 | 45000 | 0 | 0 |  |
| 890 | Exterminar Íncubo do Abismo | 883 | 1 | Aposentada | 380000 | 50000 | 0 | 0 |  |
| 891 | Exterminar Guardião Marionete | 884 | 1 | Aposentada | 400000 | 55000 | 0 | 0 |  |
| 892 | Exterminar Soldado da Perdição | 885 | 1 | Aposentada | 400000 | 55000 | 0 | 0 |  |
| 899 | Eliminar Espírito Imortal | 897 | 1 | Aposentada | 420000 | 75000 | 0 | 0 |  |
| 900 | Eliminar Caçador do Inferno | 898 | 1 | Aposentada | 420000 | 70000 | 0 | 0 |  |
| 1833 | Elevar Perfeitura | 1832 | 1 | Aposentada | 4000 | 1000 | 0 | 0 |  |
| 411 | Saquear 2 Cidades | 410 | 17 | Aposentada | 10000 | 12000 | 0 | 0 |  |
| 421 | Arena dos Bravos | 411 | 18 | Vigente | 8000 | 6750 | 0 | 0 |  |
| 801 | Deserto Amaldiçoado | 800 | 1 | Vigente | 132300 | 33075 | 0 | 1000 | 3101071 × 24 (classe 0); 2030707 × 1 (classe 0) |
| 828 | Julgamento Sanguinário | 827 | 1 | Vigente | 264600 | 33075 | 0 | 5000 | 3101071 × 24 (classe 0) |
| 880 | Palácio em Chamas | 879 | 1 | Vigente | 320000 | 40000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 898 | Rumo Infinito | 885 | 1 | Vigente | 420000 | 70000 | 0 | 0 | 3101071 × 30 (classe 0) |
| 1860 | Completar Pantanal do Rugído (Herói) | 1898,410 | 1 | Vigente | 48000 | 120000 | 120000 | 0 |  |
| 1861 | Completar Campo da Penumbra (Herói) | 1860,430 | 1 | Vigente | 84000 | 140000 | 140000 | 0 |  |
| 1862 | Completar Ninho da Águia Serpente (Herói) | 1861,440 | 1 | Vigente | 84000 | 160000 | 160000 | 0 |  |
| 1863 | Completar Selva Escura (Herói) | 1862,470 | 1 | Vigente | 192000 | 180000 | 180000 | 0 |  |
| 1864 | Completar Vila de Loya (Herói) | 1863,500 | 1 | Vigente | 216000 | 200000 | 200000 | 0 |  |
| 1865 | Completar Penhasco do Destino (Herói) | 1864,550 | 1 | Vigente | 256000 | 220000 | 220000 | 0 |  |
| 1866 | Completar Pântanos da Banshee (Herói) | 1865,590 | 1 | Vigente | 288000 | 240000 | 240000 | 0 | 3101071 × 24 (classe 0) |
| 1867 | Completar Pântano das Trevas (Herói) | 1866,620 | 1 | Vigente | 288000 | 260000 | 260000 | 0 | 3101071 × 24 (classe 0) |
| 1868 | Completar Pântano da Morte (Herói) | 1867,670 | 1 | Vigente | 288000 | 280000 | 280000 | 0 | 3101071 × 24 (classe 0) |
| 1869 | Completar Lago da Tranquilidade (Herói) | 1868,660 | 1 | Vigente | 288000 | 300000 | 300000 | 0 | 3101071 × 24 (classe 0) |
| 1870 | Completar Templo Timor Ka (Herói) | 1869,720 | 1 | Vigente | 288000 | 320000 | 320000 | 0 | 3101071 × 24 (classe 0) |
| 1871 | Completar Ruína dos Imortais (Herói) | 1870,750 | 1 | Vigente | 288000 | 340000 | 340000 | 0 | 3101071 × 24 (classe 0) |
| 1872 | Completar Terra dos Mortos (Herói) | 1871,740 | 1 | Vigente | 216000 | 360000 | 360000 | 0 | 3101071 × 24 (classe 0) |
| 1873 | Completar Reino em Chamas (Herói) | 1872,800 | 1 | Vigente | 252000 | 380000 | 380000 | 0 | 3101071 × 24 (classe 0) |
| 1874 | Completar Deserto Amaldiçoado (Herói) | 1873,801 | 1 | Vigente | 264600 | 400000 | 400000 | 0 | 3101071 × 24 (classe 0) |
| 1875 | Completar Campo do Crepúsculo (Herói) | 1874,802 | 1 | Vigente | 277200 | 420000 | 420000 | 0 | 3101071 × 24 (classe 0) |
| 1876 | Completar Dunas da Morte (Herói) | 1875,803 | 1 | Vigente | 289800 | 440000 | 440000 | 0 | 3101071 × 24 (classe 0) |
| 1877 | Completar Reino do Desespero (Herói) | 1876,804 | 1 | Vigente | 289800 | 460000 | 460000 | 0 | 3101071 × 24 (classe 0) |
| 1878 | Completar Deserto de Ukiha (Herói) | 1877,805 | 1 | Vigente | 296100 | 480000 | 480000 | 0 | 3101071 × 24 (classe 0) |
| 1879 | Completar Ilusão da Morte (Herói) | 1878,806 | 1 | Vigente | 302400 | 500000 | 500000 | 0 | 3101071 × 24 (classe 0) |
| 1880 | Completar Cemitério dos Dragões (Herói) | 1879,807 | 1 | Vigente | 302400 | 520000 | 520000 | 0 | 3101071 × 24 (classe 0) |
| 1881 | Completar Julgamento de Coragem (Herói) | 1880,827 | 1 | Vigente | 504000 | 540000 | 540000 | 0 | 3101071 × 24 (classe 0) |
| 1882 | CompletarJulgamento Sanguinário (Herói) | 1881,828 | 1 | Vigente | 529200 | 560000 | 560000 | 0 | 3101071 × 24 (classe 0) |
| 1883 | Completar Julgamento do Pesadelo (Herói) | 1882,829 | 1 | Vigente | 554400 | 580000 | 580000 | 0 | 3101071 × 24 (classe 0) |
| 1884 | Completar Julgamento do Demônio (Herói) | 1883,830 | 1 | Vigente | 579600 | 600000 | 600000 | 0 | 3101071 × 24 (classe 0) |
| 1885 | Completar Julgamento do Caos (Herói) | 1884,831 | 1 | Vigente | 579600 | 620000 | 620000 | 0 | 3101071 × 24 (classe 0) |
| 1886 | Completar Julgamento da Morte (Herói) | 1885,832 | 1 | Vigente | 592200 | 640000 | 640000 | 0 | 3101071 × 24 (classe 0) |
| 1887 | Completar Julgamento da Alma (Herói) | 1886,833 | 1 | Vigente | 604800 | 660000 | 660000 | 0 | 3101071 × 24 (classe 0) |
| 1888 | Completar Sangue de Canyon (Herói) | 1887,879 | 1 | Vigente | 600000 | 700000 | 700000 | 0 | 3101071 × 24 (classe 0) |
| 1889 | Completar Santuário das Chamas (Herói) | 1888,880 | 1 | Vigente | 640000 | 750000 | 750000 | 0 | 3101071 × 24 (classe 0) |
| 1890 | Completar Espelho do Julgamento  (Herói) | 1889,881 | 1 | Vigente | 700000 | 800000 | 800000 | 0 | 3101071 × 24 (classe 0) |
| 1891 | Completar Cemitério das Almas (Herói) | 1890,882 | 1 | Vigente | 700000 | 850000 | 850000 | 0 | 3101071 × 24 (classe 0) |
| 1892 | Completar Templo da Queda (Herói) | 1891,883 | 1 | Vigente | 760000 | 900000 | 900000 | 0 | 3101071 × 24 (classe 0) |
| 1893 | Completar Trono da Destruição (Herói) | 1892,884 | 1 | Vigente | 800000 | 950000 | 950000 | 0 | 3101071 × 24 (classe 0) |
| 1894 | Completar Fonte da Maldição  (Herói) | 1893,885 | 1 | Vigente | 800000 | 1000000 | 1000000 | 0 | 3101071 × 24 (classe 0) |
| 1895 | Completar Santuário Eterno (Herói) | 1894,897 | 1 | Vigente | 840000 | 1500000 | 1500000 | 0 | 3101071 × 30 (classe 0) |
| 1896 | Completar Caminho Infinito  (Herói) | 1895,898 | 1 | Vigente | 840000 | 2000000 | 2000000 | 0 | 3101071 × 30 (classe 0) |
| 1898 | Completar Abismo do Sussuro (Herói) | 380 | 1 | Vigente | 40000 | 100000 | 100000 | 0 | 2012015 × 2 (classe 0) |
| 804 | Alto Sacerdote Unadi | 802 | 1 | Vigente | 144900 | 36225 | 0 | 0 | 3101071 × 24 (classe 0) |
| 831 | Deus do Caos | 830 | 1 | Vigente | 289800 | 36225 | 0 | 0 | 3101071 × 24 (classe 0) |
| 883 | Templo do Corruptor | 882 | 1 | Vigente | 380000 | 50000 | 0 | 0 | 3101071 × 24 (classe 0) |
| 1837 | Quartel Nv.2 | 1842 | 1 | Aposentada | 2000 | 0 | 1000 | 0 |  |
| 1842 | Perfeitura Nv.3 | 1841 | 1 | Aposentada | 12000 | 2000 | 0 | 0 |  |
| 1838 | Elevar o nível dos soldados | 1841 | 1 | Vigente | 4000 | 0 | 2000 | 0 |  |
| 1845 | Perfeitura Nv.7 | 1844 | 10 | Aposentada | 15500 | 5250 | 0 | 0 |  |
| 1846 | Quartel Nv.4 | 1845 | 10 | Aposentada | 15500 | 0 | 0 | 0 |  |
