export const BLOCK_HEAL_PERCENT = 5;
export function criticalHealingAllowed(row: { MasterType?: unknown; SonType?: unknown }): boolean {
  return Number(row.MasterType) === 3 && [312,314].includes(Number(row.SonType));
}
export function blockHealingChance(rank: number): number {
  return rank === 2 ? 0.14 : 0.07;
}
export function blockHealingDescription(rank: number): string {
  return `Após bloquear, tem ${Math.round(blockHealingChance(rank)*100)}% de chance de recuperar ${BLOCK_HEAL_PERCENT}% da vida máxima. Esta cura não pode ser crítica.`;
}
export const isBlockHealingBuffer = (id: number): boolean => id === 10511 || id === 10521;
