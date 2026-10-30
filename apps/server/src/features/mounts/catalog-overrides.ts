import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";

// Local policy shared by the inventory, mount catalog and Flash tables.
// Original recovered tables/cache remain intact.
const itemChanges: Record<number, Record<string, string>> = {
  2180061: { TemplateName: "Carta do Mamute", Description: "Ao usar, ativa permanentemente a montaria Mamute.", Icon: "/mount_elephant.png", Property1: "7005" },
};
const mountChanges: Record<number, Record<string, string>> = {
  6002: { NeedItemId: "0", Property1: "1" },
  6004: { NeedItemId: "0", Property1: "1" },
};
export function localMountItem<T extends Record<string, any>>(row: T): T {
  const change = itemChanges[Number(row.TemplateId)];
  return change ? { ...row, ...change } : row;
}
export function localMountTemplate<T extends Record<string, any>>(row: T): T {
  const change = mountChanges[Number(row.TemplateId)];
  return change ? { ...row, ...change } : row;
}
function escape(value: string): string { return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
export function localMountTables(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4)), parts: Buffer[] = [data.subarray(0, 4)]; let pos = 4;
  while (pos < data.length) {
    const start = pos, n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4;
    let body = data.subarray(pos, pos + length); pos += length;
    const changes = name === "ItemTempInfos" ? itemChanges : name === "MountTempInfos" ? mountChanges : undefined;
    if (changes) body = Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g, element => {
      const patch = changes[Number(element.match(/TemplateId="(\d+)"/)?.[1])];
      if (!patch) return element;
      for (const [key, value] of Object.entries(patch)) {
        const attribute = new RegExp(`${key}="[^"]*"`);
        if (!attribute.test(element)) throw new Error("Campo de montaria ausente: " + key);
        element = element.replace(attribute, () => `${key}="${escape(value)}"`);
      }
      return element;
    }));
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length); parts.push(data.subarray(start, start + 1 + n), size, body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
