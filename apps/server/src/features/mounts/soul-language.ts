import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

// Current release only. Never rewrite unrelated translations or the online game.
export const soulLanguagePath = "/cdn/ui/zh_cn/language_176d3d93.dat";
const originalHash = "5a308c2f481e65cb9ec2f7f5bc91a14dab08087d1eda5781f08f50bd6cabeb4f";
export const soulTranslations: Record<string, string> = {
  "MountRefiningSoulFrame.skillImage.tipdata": "Vontade da Alma da Fera — nível {0}: {1}%.\\nDefine a parcela dos atributos de adestramento e montarias ativas disponível para os quatro refinos.\\nComeça em 24% e chega a 100%. Cada atributo tem um limite de 100.000 pontos disponíveis.\\nOs refinos laterais aplicam de 0% a 300% sobre essa parcela e somam o bônus ao personagem.\\nCada Coração do Refino da Fera fornece 1 ponto de progresso. Ao preencher a barra, um dos quatro refinos avança; os avanços também elevam a Vontade.",
  "MountRefiningSoulItem.headImage.tipdata": "Parcela disponível de {1}: {0} pontos (após o limite de 100.000).\\nRefino de {1}: {2}% dessa parcela.\\nBônus adicional de {3}: +{4}. Os atributos originais permanecem somados.",
};
for (const [index, name] of ["força", "inteligência", "proteção", "físico"].entries())
  soulTranslations["MountRefiningSoulFrame.skillImage.propValue" + index] = `${name}: base de adestramento + montarias ativas = {0}; parcela pela Vontade = {1} (antes do limite). O refino lateral considera no máximo {2} pontos.`;

export function soulLanguageResource(path: string, raw: Buffer): Buffer | undefined {
  if (path !== soulLanguagePath) return undefined;
  if (createHash("sha256").update(raw).digest("hex") !== originalHash) throw new Error("Versão das descrições de refino espiritual não corresponde à referência fixa.");
  let text = inflateSync(raw).toString("utf8");
  for (const [key, value] of Object.entries(soulTranslations)) {
    const prefix = key + ":";
    const line = text.split(/\r?\n/).find(line => line.startsWith(prefix));
    if (!line) throw new Error("Descrição de refino ausente: " + key);
    text = text.replace(line, prefix + value);
  }
  return deflateSync(Buffer.from(text, "utf8"));
}
