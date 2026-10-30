import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// The original .titles is a compressed AMF3 dynamic dictionary of grid cells.
const db = new DatabaseSync('data/state.sqlite', { readOnly: true });
try {
  const source = db.prepare("SELECT * FROM assets WHERE path='/cdn/maps/10000/10000_044b2a4c.titles' ORDER BY saved_at DESC LIMIT 1").get();
  if (!source) throw Error('Grade original não preservada');
  const wire = readFileSync('data/assets/objects/' + source.sha256 + '.bin');
  if (wire.length !== source.bytes || createHash('sha256').update(wire).digest('hex') !== source.sha256) throw Error('Grade corrompida');
  const bytes = inflateSync(wire); let pos = 0; const strings = [];
  function u29() { let value = 0; for (let n = 0; n < 4; n++) { const b = bytes[pos++]; if (b === undefined) throw Error('AMF truncado'); if (n === 3) return value * 256 + b; value = value * 128 + (b & 127); if (!(b & 128)) return value; } }
  function string() { const tag = u29(); if (!(tag & 1)) { if (strings[tag >> 1] === undefined) throw Error('Referência AMF inválida'); return strings[tag >> 1]; } const len = tag >> 1; const value = bytes.subarray(pos, pos + len).toString('utf8'); pos += len; if (len) strings.push(value); return value; }
  if (bytes[pos++] !== 10 || u29() !== 11 || string() !== '') throw Error('Dicionário AMF inesperado');
  const width = 450, height = 300, bits = Buffer.alloc(Math.ceil(width * height / 8)); let walkable = 0, outside = 0;
  while (true) {
    const key = string(); if (!key) break;
    const type = bytes[pos++]; const value = type === 4 ? u29() : type === 3 ? 1 : type === 2 ? 0 : NaN;
    if (!Number.isFinite(value)) throw Error('Valor de célula AMF inesperado');
    const match = /^(\d+)_(\d+)$/.exec(key); if (!match) throw Error('Chave de célula inválida');
    const x = Number(match[1]), y = Number(match[2]);
    // FindPath8 iterates only Width/20 × Height/20; export has extra border cells.
    if (x >= width || y >= height) { outside++; continue; }
    if (value) { const n = y * width + x; bits[n >> 3] |= 1 << (n & 7); walkable++; }
  }
  if (pos !== bytes.length || !walkable) throw Error('Grade AMF incompleta');
  mkdirSync('reference/sky-realm', { recursive: true });
  // Birth node 14 in MapNodeInfos, also 1000001 in the original 10000.xml.
  writeFileSync('reference/sky-realm/map.json', JSON.stringify({ mapId: 10000, width, height, cellSize: 20, spawn: { x: 175, y: 98 }, walkable, source: { path: source.path, sha256: source.sha256 }, bits: bits.toString('base64') }) + '\n');
  console.log(JSON.stringify({ width, height, walkable, outside, source: source.path }));
} finally { db.close(); }
