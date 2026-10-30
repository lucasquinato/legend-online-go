import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AssetFallback } from "./asset-fallback.js";
import type { Config } from "./config.js";
import type { Store } from "./store.js";

export interface Asset {
  id: string;
  path: string;
  bytes: number;
  sha256: string;
  content_type: string;
  saved_at: string;
}
export function isAsset(path: string): boolean {
  return /^\/(cdn|client|xml)\//.test(path) && path !== "/client/config.xml";
}
export class AssetCache {
  private pending = new Map<string, Promise<Asset>>();
  readonly directory: string;
  private fallback: AssetFallback;
  constructor(
    private config: Config,
    private store: Store,
  ) {
    this.directory = join(store.dir, "assets");
    this.fallback = new AssetFallback(store.dir);
    store.db.exec(`CREATE TABLE IF NOT EXISTS assets(
      id TEXT PRIMARY KEY,path TEXT NOT NULL,bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,content_type TEXT NOT NULL,saved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS asset_sources(id TEXT PRIMARY KEY,source TEXT NOT NULL,saved_at TEXT NOT NULL);`);
  }
  private key(url: URL): string {
    const copy = new URL(url);
    for (const name of ["rnd", "ran", "rand", "random", "r", "_"])
      copy.searchParams.delete(name);
    // O motor AIR acrescenta a hora atual a Loading.swf; isso não é uma versão do arquivo.
    if (copy.pathname.toLowerCase() === "/client/loading.swf")
      copy.searchParams.delete("v");
    copy.searchParams.sort();
    return createHash("sha256").update(copy.href).digest("hex");
  }
  file(asset: Asset): string {
    if (!/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("Hash inválido");
    return join(this.directory, "objects", asset.sha256 + ".bin");
  }
  list(): Asset[] {
    return this.store.db
      .prepare("SELECT * FROM assets ORDER BY path,id")
      .all() as unknown as Asset[];
  }
  async verify(asset: Asset): Promise<boolean> {
    try {
      if ((await stat(this.file(asset))).size !== asset.bytes) return false;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(this.file(asset)))
        hash.update(chunk);
      return hash.digest("hex") === asset.sha256;
    } catch {
      return false;
    }
  }
  async get(url: URL): Promise<Asset> {
    if (url.origin !== this.config.upstreamOrigin || !isAsset(url.pathname))
      throw new Error("Recurso fora da origem permitida");
    const id = this.key(url);
    const existing = this.pending.get(id);
    if (existing) return existing;
    const task = this.load(url, id);
    this.pending.set(id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(id);
    }
  }
  private async load(url: URL, id: string): Promise<Asset> {
    const saved = this.store.db
      .prepare("SELECT * FROM assets WHERE id=?")
      .get(id) as unknown as Asset | undefined;
    if (
      saved &&
      this.config.resourceMode !== "online" &&
      (await this.verify(saved))
    ) {
      this.store.dependency(url.pathname, 200, saved.bytes, saved.sha256);
      return saved;
    }
    if (this.config.resourceMode === "offline") {
      this.store.dependency(url.pathname, 503, 0, "");
      throw Object.assign(
        new Error("Recurso ausente ou corrompido no acervo local"),
        { statusCode: 503 },
      );
    }
    await mkdir(join(this.directory, "objects"), { recursive: true });
    let lastError: unknown;
    for (const source of [url, ...this.fallback.candidates(url)]) {
    const temporary = join(this.directory, randomUUID() + ".part");
    const hash = createHash("sha256");
    let bytes = 0;
    let status = 599;
    try {
      const response = await fetch(source, {
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(this.config.upstreamTimeoutMs, 15000)),
        headers: { "user-agent": "LegendOnline-Node-Gateway/0.2" },
      });
      if (response.status !== 200 || !response.body) {
        status = response.status;
        await response.body?.cancel();
        throw Object.assign(new Error("Recurso indisponível no upstream"), {
          statusCode: response.status >= 400 ? response.status : 502,
        });
      }
      const mime = response.headers.get("content-type") ?? "application/octet-stream";
      let prefix = Buffer.alloc(0);
      const measure = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          if (prefix.length < 512) prefix = Buffer.concat([prefix, chunk.subarray(0, 512 - prefix.length)]);
          bytes += chunk.length;
          if (bytes > 256 * 1024 * 1024)
            return callback(new Error("Recurso excede 256 MiB"));
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body as never),
        measure,
        createWriteStream(temporary, { flags: "wx" }),
      );
      const declared = response.headers.get("content-length");
      if (
        !response.headers.get("content-encoding") &&
        declared !== null &&
        Number(declared) !== bytes
      )
        throw new Error("Transferência incompleta");
      if (!bytes || /text\/html/i.test(mime) || /^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(prefix.toString("utf8")))
        throw new Error("Resposta inválida: asset vazio ou página HTML");
      const asset: Asset = {
        id,
        path: url.pathname,
        bytes,
        sha256: hash.digest("hex"),
        content_type:
          response.headers.get("content-type") ?? "application/octet-stream",
        saved_at: new Date().toISOString(),
      };
      await rename(temporary, this.file(asset));
      this.store.db
        .prepare(
          `INSERT INTO assets VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,sha256=excluded.sha256,content_type=excluded.content_type,saved_at=excluded.saved_at`,
        )
        .run(
          id,
          asset.path,
          bytes,
          asset.sha256,
          asset.content_type,
          asset.saved_at,
        );
      this.store.db.prepare("INSERT INTO asset_sources VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,saved_at=excluded.saved_at").run(id, source.href, asset.saved_at);
      this.store.dependency(url.pathname, 200, bytes, asset.sha256);
      return asset;
    } catch (error) {
      this.store.dependency(url.pathname, status, bytes, "");
      await unlink(temporary).catch(() => {});
      lastError = error;
    }
    }
    throw lastError;
  }
}
