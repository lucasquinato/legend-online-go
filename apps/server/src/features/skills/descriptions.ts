import { concentrationAttackPercent } from "./passive-balance.js";
import { BLOCK_HEAL_PERCENT, blockHealingDescription, criticalHealingAllowed, isBlockHealingBuffer } from "./healing-balance.js";
import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import { basicSkills, basicSkillProperties, basicSkillBuffers } from "./index.js";
import { runeDescription, runeSkillDescription, runeBufferDescription } from "../runes/descriptions.js";
function xml(text: string): string { return text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
export function skillDescription(id: number): string {
  const row = basicSkills.get(id)!;
  let text = String(row.Description);
  const son = Number(row.SonType) % 100;
  const grade = Number(row.Grades);
  if (Number(row.MasterType) === 1 && son === 5) return blockHealingDescription(grade);
  if (Number(row.MasterType) === 1 && son === 13) return `Cria a si mesmo escudo que absorve dano equivalente a ${18 + grade * 2}% da vida máxima por ${grade + 2} turnos`;
  if (Number(row.MasterType) === 1 && son === 14) return `Diminui ${10 + grade * 10}% do dano recebido de todos os membros da equipe, durante ${grade * 2} turnos`;
  if (Number(row.MasterType) === 2 && son === 6) return `Dispersa ${grade} ${grade === 1 ? "efeito positivo" : "efeitos positivos"} de todos os inimigos`;
  if (Number(row.MasterType) === 3 && son === 6) return `Purifica ${grade} ${grade === 1 ? "efeito maligno" : "efeitos malignos"} de todos os aliados`;
  const property = basicSkillProperties.get(id);
  if (son === 2 && property) text = Number(row.MasterType) === 3 ? `Aumenta o ataque mágico em ${property.MagicAttack}%.` : `Aumenta o ataque físico em ${property.Attack}%.`;
  if (Number(row.MasterType) === 1 && son === 4 && property) text = `Aumenta a defesa física em ${property.Defence}%, a vida máxima em ${property.Live}% e a cura recebida em ${basicSkillBuffers.get(Number(row.BufferIds))!.ValuePercent}%.`;
  if (Number(row.MasterType) === 2 && son === 4 && property) text = `Aumenta o atributo de crítico em ${property.ForceHit}% e a vida máxima em ${property.Live}%.`;
  if (Number(row.MasterType) === 3 && son === 4 && property) text = `Aumenta a defesa mágica em ${property.MagicDefence}% e o poder de cura em ${basicSkillBuffers.get(Number(row.BufferIds))!.ValuePercent}%.`;
  // Keep the coefficient placeholders so every rank uses its own table values.
  if (Number(row.Parameter2) !== 0 && Number(row.CountWay) === 1) text += " Acrescenta {Parameter2} pontos de dano.";
  if (Number(row.MasterType) === 3 && son === 8) text = "Causa {Parameter1}% de danos mágicos a todos os inimigos.";
  if (Number(row.MasterType) === 3 && son === 12) text = "Recupera vida equivalente a {Parameter1}% do ataque mágico do aliado com menor percentual de vida e reduz em 15% o dano recebido por 2 turnos.";
  if (Number(row.MasterType) === 3 && son === 14) text = "Recupera vida equivalente a {Parameter1}% do ataque mágico de todos os aliados e concede 10 pontos de fúria.";
  if (criticalHealingAllowed(row)) text += " Pode realizar cura crítica com multiplicador base de 150%, acrescido dos bônus do atributo crítico, da penetração e de dano crítico do conjurador.";
  else if (Number(row.CountWay) === 7) text += " Esta cura não pode ser crítica.";
  // The client's getter resolves these from the table and later talent modifiers.
  return text;
}
/** Patch only local presentation/config; keep captured objects and other trees intact. */
export function localSkillTables(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4)), parts: Buffer[] = [data.subarray(0, 4)]; let pos = 4;
  while (pos < data.length) {
    const start = pos, n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4;
    let body = data.subarray(pos, pos + length); pos += length;
    if (name === "SkillTempInfos") body = Buffer.from(body.toString().replace(/<SkillTempInfo\s+[^>]*\/>/g, element => {
      const id = Number(element.match(/TemplateId="(\d+)"/)?.[1]);
      const text = basicSkills.has(id) ? skillDescription(id) : runeSkillDescription(id);
      return text ? element.replace(/Description="[^"]*"/, () => `Description="${xml(text)}"`) : element;
    }));
    if (name === "SkillPropertyTempInfos") body = Buffer.from(body.toString().replace(/<SkillPropertyTempInfo\s+[^>]*\/>/g, element => {
      const id = Number(element.match(/TemplateId="(\d+)"/)?.[1]), percent = concentrationAttackPercent(id);
      return percent === undefined ? element : element.replace(/Attack="[^"]*"/, `Attack="${percent}"`);
    }));
    if (name === "RuneTempInfos" || name === "SkillBufferTempInfos") body = Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g, element => {
      const id = Number(element.match(name === "RuneTempInfos" ? /TemplateId="(\d+)"/ : /\bId="(\d+)"/)?.[1]);
      const block = name === "SkillBufferTempInfos" && isBlockHealingBuffer(id);
      if (block) element = element.replace(/ValuePercent="[^"]*"/, `ValuePercent="${BLOCK_HEAL_PERCENT}"`);
      const text = block ? blockHealingDescription(id === 10521 ? 2 : 1) : name === "RuneTempInfos" ? runeDescription(id) : runeBufferDescription(id);
      return text ? element.replace(name === "RuneTempInfos" ? /Description="[^"]*"/ : /BufferName="[^"]*"/, () => `${name === "RuneTempInfos" ? "Description" : "BufferName"}="${xml(text)}"`) : element;
    }));
    if (name === "ConfigInfos") body = Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g, element => {
      const config = element.match(/ConfigName="([^"]+)"/)?.[1], value = config === "AddSkill_Grade" ? "2" : config === "Talent_MaxPlayerGrade" ? "80" : undefined;
      return value ? element.replace(/ConfigValue="[^"]*"/, `ConfigValue="${value}"`) : element;
    }));
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length); parts.push(data.subarray(start, start + 1 + n), size, body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
