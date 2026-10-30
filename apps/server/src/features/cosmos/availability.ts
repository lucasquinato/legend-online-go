/** Availability is a local product policy; original templates remain preserved. */
const fixedFields = ["Power","Agility","Intellect","Physique","Captain","Attack","Defence","MagicAttack","MagicDefence","ForceHit","Parry","Live","Conat","Penetrate","StunAttr"];
const keptEffects = new Set([1014,1015,1104,1105,1204,1205,1304,1305,1404,1405,1604,1605]);
export const unlimitedCosmos = new Set([1014,1015,1104,1105]);
export const localBufferPercentages: Record<number, number> = { 80701: 2, 80702: 5, 80901: 2, 80902: 5 };
export const localBufferDescriptions: Record<number, string> = {
  80701: "Ao atacar, tem 10% de probabilidade de recuperar vida equivalente a {ValuePercent}% do dano causado, sem limite de recuperação por ativação",
  80702: "Ao atacar, tem 10% de probabilidade de recuperar vida equivalente a {ValuePercent}% do dano causado, sem limite de recuperação por ativação",
  80901: "Ao ser atacado, tem 10% de probabilidade de refletir {ValuePercent}% do dano recebido, sem limite de dano refletido por ativação",
  80902: "Ao ser atacado, tem 10% de probabilidade de refletir {ValuePercent}% do dano recebido, sem limite de dano refletido por ativação",
};
export function cosmosVisible(row: Record<string,string> | undefined): boolean {
  return !!row && (Number(row.Profile)===6 || fixedFields.some(field=>Number(row[field]??0)>0) || keptEffects.has(Number(row.TemplateId)));
}
