const concentration = new Map([[20211,10],[20221,20],[20231,25]]);
export const concentrationAttackPercent = (skillId: number): number | undefined => concentration.get(skillId);
