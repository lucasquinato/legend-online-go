// Portado de PackageOut, PackageIn e ByteSocket recuperados. TCP é um stream:
// uma leitura pode conter meio pacote ou vários pacotes.
export const INITIAL_KEY = Buffer.from([174, 191, 86, 120, 171, 205, 239, 241]);
export const HEADER = 0x71ab;
export function checksum(packet: Buffer): number {
  let value = 119;
  for (let i = 6; i < packet.length; i++) value += packet[i]!;
  return value & 0x7f7f;
}
export function frame(
  opcode: number,
  userId: number,
  body: Buffer = Buffer.alloc(0),
  extra1 = 0,
  extra2 = 0,
): Buffer {
  const packet = Buffer.alloc(20 + body.length);
  if (packet.length > 65535) throw new Error("Pacote excede 65535 bytes");
  packet.writeUInt16BE(HEADER, 0);
  packet.writeUInt16BE(packet.length, 2);
  packet.writeUInt16BE(opcode, 6);
  packet.writeInt32BE(userId, 8);
  packet.writeInt32BE(extra1, 12);
  packet.writeInt32BE(extra2, 16);
  body.copy(packet, 20);
  packet.writeUInt16BE(checksum(packet), 4);
  return packet;
}
export function crypt(packet: Buffer, key: Buffer, decrypt = false): Buffer {
  if (key.length !== 8)
    throw new Error("Chave de transporte deve ter oito bytes");
  const output = Buffer.from(packet);
  for (let i = 0; i < packet.length; i++) {
    if (i === 0) {
      output[i] = packet[i]! ^ key[0]!;
      continue;
    }
    const previous = decrypt ? packet[i - 1]! : output[i - 1]!;
    const at = i % 8;
    key[at] = ((key[at]! + previous) ^ i) & 255;
    output[i] = decrypt
      ? ((packet[i]! - previous) ^ key[at]!) & 255
      : ((packet[i]! ^ key[at]!) + previous) & 255;
  }
  return output;
}
export class FrameReader {
  private pending = Buffer.alloc(0);
  key = Buffer.from(INITIAL_KEY);
  push(chunk: Buffer, receive: (packet: Buffer) => void): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    if (this.pending.length > 1024 * 1024)
      throw new Error("Buffer TCP excedido");
    while (this.pending.length >= 4) {
      const preview = crypt(
        this.pending.subarray(0, 4),
        Buffer.from(this.key),
        true,
      );
      if (preview.readUInt16BE(0) !== HEADER)
        throw new Error("Cabeçalho TCP inválido");
      const size = preview.readUInt16BE(2);
      if (size < 20) throw new Error("Comprimento TCP inválido");
      if (this.pending.length < size) return;
      const packet = crypt(this.pending.subarray(0, size), this.key, true);
      this.pending = this.pending.subarray(size);
      if (packet.readUInt16BE(4) !== checksum(packet))
        throw new Error("Checksum inválido");
      receive(packet); // callback pode trocar a chave antes do próximo pacote.
    }
  }
}
export interface ProtoField {
  number: number;
  wire: number;
  value: bigint | Buffer;
}
export function varint(value: number | bigint): Buffer {
  let n = BigInt(value);
  if (n < 0n) throw new Error("Varint negativo não suportado neste helper");
  const bytes: number[] = [];
  do {
    const b = Number(n & 127n);
    n >>= 7n;
    bytes.push(b | (n ? 128 : 0));
  } while (n);
  return Buffer.from(bytes);
}
export function protoString(number: number, value: string): Buffer {
  const bytes = Buffer.from(value);
  return Buffer.concat([
    varint((number << 3) | 2),
    varint(bytes.length),
    bytes,
  ]);
}
export function protoInt(number: number, value: number): Buffer {
  return Buffer.concat([varint(number << 3), varint(value)]);
}
export function fields(body: Buffer): ProtoField[] {
  let at = 0;
  function read(): bigint {
    let value = 0n;
    for (let shift = 0; shift < 70; shift += 7) {
      if (at >= body.length) throw new Error("Protobuf truncado");
      const b = body[at++]!;
      value |= BigInt(b & 127) << BigInt(shift);
      if (!(b & 128)) return value;
    }
    throw new Error("Varint inválido");
  }
  const result: ProtoField[] = [];
  while (at < body.length) {
    const tag = Number(read());
    const number = tag >>> 3;
    const wire = tag & 7;
    if (!number) throw new Error("Campo Protobuf zero");
    if (wire === 0) {
      result.push({ number, wire, value: read() });
      continue;
    }
    const size =
      wire === 2 ? Number(read()) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
    if (size < 0 || !Number.isSafeInteger(size) || at + size > body.length)
      throw new Error("Campo Protobuf inválido");
    result.push({ number, wire, value: body.subarray(at, at + size) });
    at += size;
  }
  return result;
}
export function loginFields(packet: Buffer): { proof: string; key: Buffer } {
  const list = fields(packet.subarray(20));
  const proof = list.find((f) => f.number === 2 && Buffer.isBuffer(f.value));
  const keys = list
    .filter((f) => f.number === 3 && f.wire === 0)
    .map((f) => Number(f.value));
  if (
    !proof ||
    !Buffer.isBuffer(proof.value) ||
    keys.length !== 8 ||
    keys.some((k) => k < 1 || k > 255)
  )
    throw new Error("LoginReqMsg inválido");
  return { proof: proof.value.toString("utf8"), key: Buffer.from(keys) };
}
