import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";

export const mountStylePath = "/cdn/ui/zh_cn/xml/xml_d0a3cb68.png";
const sourceHash = "f8925fb650e5e94cb4a39ca131f8baec09b9f4b2cfbb9463aebcb28616950dbc";
/** Replace only the mount-on bitmap caption. Keep the Rest/dismount button intact. */
export function mountButtonLabel(raw: Buffer): Buffer {
  if (createHash("sha256").update(raw).digest("hex") !== sourceHash) throw new Error("Versão dos estilos de montaria não corresponde à referência fixa.");
  const data = inflateSync(raw), parts: Buffer[] = []; let pos = 0, changed = 0;
  while (pos < data.length) {
    const start = pos, n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4; let body = data.subarray(pos, pos + length); pos += length;
    if (name === "mounts.xml") {
      let text = body.toString().replace(/<component\s+[^>]*\/>/g, element => {
        if (!/\bstylename="mount\.mountBtn"/.test(element)) return element;
        changed++;
        return element.replace(/iconStyle="[^"]*"/, 'iconStyle="mount.localMountLabel"').replace(/iconInnerRectString="[^"]*"/, 'iconInnerRectString="17,82,12,21,13"');
      });
      text = text.replace("</components>", '<component classname="com.pickgliss.ui.text.FilterFrameText" stylename="mount.localMountLabel" textFormatStyle="core.friendsButtonSelected_t" filterString="core.normal_f" autoSize="none" width="82" height="21" mouseEnabled="false" selectable="false" text="Montar" /></components>');
      body = Buffer.from(text);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length); parts.push(data.subarray(start, start + 1 + n), size, body);
  }
  if (changed !== 1) throw new Error("Esperado exatamente um botão Montar na versão atual.");
  return deflateSync(Buffer.concat(parts), { level: 9 });
}

/** The Flash loader rejects resources differing by 3,000+ bytes from this index. */
export function mountButtonIndex(path: string, raw: Buffer, style: Buffer): Buffer {
  if (path !== "/client/code_md5.dat" && path !== "/client/size.xml") return raw;
  const compressed = path.endsWith(".dat");
  const text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString("utf8");
  let found = 0;
  const updated = text.replace(/<Item\b[^>]*\/>/g, row => {
    const name = /\bname="([^"]*)"/.exec(row)?.[1]?.replaceAll("\\", "/");
    if (name !== "ui/zh_cn/xml/xml.png" && name !== "ui/zh_cn/xml/xml_d0a3cb68.png") return row;
    found++;
    return row.replace(/\bsize="[^"]*"/, `size="${style.length}"`);
  });
  if (!found) throw new Error("Pacote de estilos ausente do índice do cliente");
  const bytes = Buffer.from(updated);
  return compressed ? deflateSync(deflateSync(bytes)) : bytes;
}
