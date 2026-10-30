// Existing reward wording only. These formatters do not calculate or grant gains.
export const systemMessageText = Object.freeze({
  campaignBattleXp: (xp: number) => `Você recebeu ${xp} de XP pela batalha.`,
  campaignCompletionXp: (xp: number) => `Você recebeu ${xp} de XP pela conclusão da campanha.`,
  campaignCardItem: (name: string, count: number) => `Você recebeu [${name}] x${count} pela carta da campanha.`,
  labyrinthFloorXp: (xp: number, floor: number, name: string) => `Você recebeu ${xp} de XP pelo piso ${floor} do ${name}.`,
  collectedItems: (items: readonly { name: string; count: number }[]) => "Obteve:" + items.map(item => `${item.name} x${item.count}`).join(","),
});
