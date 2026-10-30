/** LOGo: linear research and town-hall production. */
export const TAX_COOLDOWN_MS = 10 * 60 * 1000;

export function townHallProduction(level: number): number {
  const grade = Math.max(10, Math.min(80, Math.floor(level)));
  return 500000 + Math.floor((grade - 10) * 4500000 / 70);
}

export function sanctuaryBonus(son: number, level: number): number | undefined {
  const advanced = son >= 2000;
  const base = advanced ? son - 1000 : son;
  let maximum: number;
  if (base === 1304) maximum = 1000000;
  else if ([1421, 1423, 1441, 1442].includes(base)) maximum = advanced ? 13000 : 10000;
  else if ([1422, 1424, 1443, 1444, 1446].includes(base)) maximum = advanced ? 9000 : 7000;
  else if ([1420, 1445].includes(base)) return 2 * Math.floor((advanced ? 13000 : 10000) * Math.max(0, Math.min(80, level)) / 80);
  else return undefined;
  return Math.floor(maximum * Math.max(0, Math.min(80, level)) / 80);
}

/** Change only balance fields, preserving all recovered costs and prerequisites. */
export function settlementBuildingFields(row: Record<string, any>): Record<string, string> {
  const son = Number(row.SonType), level = Number(row.BuildingGrade);
  if (son === 901) {
    const production = townHallProduction(level);
    return { Property1: String(production), Activity: `Produção de Ouro ${production}/hr` };
  }
  const bonus = sanctuaryBonus(son, level);
  if (bonus === undefined) return {};
  return { Activity: String(row.Activity).replace(/\+\s*\d+(?:\.\d+)?/, `+${bonus}`) };
}
