/** Shared penetration is an additional stat, not an equipment family. */
export function requiresSpecialSlot(template: Record<string, string>): boolean {
  return Number(template.Penetrate ?? 0) > 0;
}
export function equipmentFamily(template: Record<string, string>): string {
  if (!requiresSpecialSlot(template)) return `single:${template.MasterType}`;
  const attributes = ["Power", "Agility", "Intellect", "Physique", "Captain", "Attack", "Defence", "MagicAttack", "MagicDefence", "ForceHit", "Parry", "Live", "Conat", "StunAttr"];
  return `compound:${attributes.filter(key => Number(template[key] ?? 0) !== 0).join("+")}`;
}
