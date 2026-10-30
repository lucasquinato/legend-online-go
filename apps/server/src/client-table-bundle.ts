import { deflateSync } from "node:zlib";

/** BaseLoaderII.oneselfSize checks the compressed payload length, excluding this header. */
export function encodeClientTableBundle(data: Buffer): Buffer {
  const payload = deflateSync(data);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}
