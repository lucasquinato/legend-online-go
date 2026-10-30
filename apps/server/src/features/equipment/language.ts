import { deflateSync, inflateSync } from "node:zlib";

// The former level-70 synthesis family now groups under level 60. Keep its
// original title and all existing translations, including the level-70 title.
export function equipmentLanguageResource(raw: Buffer): Buffer {
  const original = inflateSync(raw).toString("utf8");
  let text=original.replace(/^army\.Equip\.conciseBtnTip:[^\r\n]*/m,"army.Equip.conciseBtnTip:Refinação de Equipamentos: <br/> Esta função será ativada no nível 80.");
  const prefix = "store.view.compose.ComposeCellButton.suitGroup";
  const source = text.split(/\r?\n/).find(line => line.startsWith(prefix + "70:"));
  if (!source) throw new Error("Título original do quarto conjunto de síntese ausente");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  for(const [id,label]of [[60,source.slice((prefix+"70:").length)],[1000,"Armadura"],[1001,"Criaturas"]] as const){
    const key=prefix+id+":",line=text.split(/\r?\n/).find(row=>row.startsWith(key));
    if(line)text=text.replace(line,key+label);
    else text+=(text.endsWith("\n")?"":newline)+key+label+newline;
  }
  return text===original?raw:deflateSync(Buffer.from(text,"utf8"));
}
