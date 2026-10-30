# Continuação avançada do Selo da Alma

Libera automaticamente com personagem 80 e selo comum 80. O selo comum mantém
o próprio código, curva de custo, nível máximo e efeitos, sem alterações.

O avançado usa seniorStoreGrade/seniorStoreGp, começa no 80 sem custo e termina
no 100. Cada nível custa exatamente 720 itens 208031, Selo da Alma. O bônus
total das gemas é nível avançado * 5: +400% no 80 até +500% no 100. Substitui
o percentual comum; não soma os dois e não multiplica fontes fora das gemas.
Refinação de equipamento continua calculada depois do valor total da gema.

São necessários 14400 itens do zero dessa continuação ao máximo. Consome em
ordem de pilhas pela API central de inventário, aceita consumo parcial e limita
o débito ao restante até o máximo. Não cobra materiais excedentes.

SoulSealPatch altera somente três métodos de JewelFrame (seleção da etapa e
limite), a fórmula avançada de GoodsHelp e quatro previews que antes exigiam
profissão. O normal getJewelEffecyByGrade permanece protegido byte a byte.
Os builds dos módulos 2 e 5 mantêm os gates anteriores e exigem o probe AIR do
percentual avançado e da janela sem profissão, preservando requisitos 80/80 e
limite 100. As cópias com aliases não são publicadas. A tabela 104 é estendida
com 81–100, custo 720; a tabela comum 15 permanece intacta.

Verificação visual completa do launcher continua a cargo do teste do jogador;
os probes executam expressões e carregamentos reais, com dependências da janela
substituídas somente nas cópias de teste.
